import {
  createDirectRelationship,
  IntegrationStep,
  IntegrationStepExecutionContext,
  JobState,
  RelationshipClass,
} from '@jupiterone/integration-sdk-core';

import { createAPIClient } from '../client';
import { IntegrationConfig } from '../config';
import { relationships, steps } from '../constants';
import { SiteAssetsMap } from '../types';
import { getScanKey } from './scans';

async function buildSiteAssetsMap(jobState: JobState): Promise<SiteAssetsMap> {
  const siteAssetsMap: SiteAssetsMap = {};

  await jobState.iterateRelationships(
    {
      _type: relationships.SITE_HAS_ASSET._type,
    },
    (relationship) => {
      const { _fromEntityKey, _toEntityKey } = relationship;

      const siteKey = _fromEntityKey?.toString();
      const assetKey = _toEntityKey?.toString();

      if (siteKey && assetKey) {
        if (!siteAssetsMap[siteKey]) {
          siteAssetsMap[siteKey] = [];
        }

        siteAssetsMap[siteKey].push(assetKey);
      }
    },
  );

  return siteAssetsMap;
}

export async function fetchScanAssets({
  logger,
  instance,
  jobState,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const apiClient = createAPIClient(instance.config, logger);

  const siteAssetsMap = await buildSiteAssetsMap(jobState);

  const jobs: Promise<void>[] = [];

  for (const [siteKey, assetKeys] of Object.entries(siteAssetsMap)) {
    const siteEntity = await jobState.findEntity(siteKey);

    if (siteEntity && siteEntity.id) {
      await apiClient.iterateSiteScans(
        siteEntity.id as string,
        async (scan) => {
          const scanEntity = await jobState.findEntity(getScanKey(scan.id));

          if (scanEntity) {
            for (const assetKey of assetKeys) {
              const assetEntity = await jobState.findEntity(assetKey);
              if (assetEntity) {
                jobs.push(
                  jobState.addRelationship(
                    createDirectRelationship({
                      _class: RelationshipClass.MONITORS,
                      from: scanEntity,
                      to: assetEntity,
                    }),
                  ),
                );
              }
            }
          }
        },
      );
    }
  }

  await Promise.all(jobs);
}

export const scanAssetsStep: IntegrationStep<IntegrationConfig>[] = [
  {
    id: steps.FETCH_SCAN_ASSETS,
    name: 'Fetch Scan Assets',
    entities: [],
    relationships: [relationships.SCAN_MONITORS_ASSET],
    dependsOn: [
      steps.FETCH_SITE_ASSETS,
      steps.FETCH_SCANS,
      steps.FETCH_SITES,
      steps.FETCH_ASSETS,
    ],
    executionHandler: fetchScanAssets,
  },
];

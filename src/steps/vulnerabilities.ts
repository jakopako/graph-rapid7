import {
  createDirectRelationship,
  createIntegrationEntity,
  Entity,
  IntegrationStep,
  IntegrationStepExecutionContext,
  JobState,
  RelationshipClass,
} from '@jupiterone/integration-sdk-core';

import { createAPIClient } from '../client';
import { InsightVmAssetVulnerability, IntegrationConfig } from '../types';
import { entities, relationships, steps } from '../constants';

function getAssetVulnerabilityKey(
  assetId: string,
  assetVulnerabilityId: string,
) {
  return `insightvm_asset_vulnerability:${assetId}:${assetVulnerabilityId}`;
}

function createAssetVulnerabilityEntity(
  assetVulnerability: InsightVmAssetVulnerability,
  assetId: string,
) {
  return createIntegrationEntity({
    entityData: {
      source: assetVulnerability,
      assign: {
        _key: getAssetVulnerabilityKey(assetId, assetVulnerability.id),
        _type: entities.FINDING._type,
        _class: entities.FINDING._class,
        id: `${assetVulnerability.id}`,
        name: assetVulnerability.id,
        category: 'host',
        open: assetVulnerability.status === 'vulnerable' ? true : undefined,
        severity: 'unknown',
        numericSeverity: 5,
      },
    },
  });
}

export function getVulnerabilityKey(id: string): string {
  return `insightvm_vulnerability:${id}`;
}

async function findOrCreateVulnerability(
  jobState: JobState,
  assetVulnerability: InsightVmAssetVulnerability,
): Promise<Entity> {
  const existingVulnerability = await jobState.findEntity(
    getVulnerabilityKey(assetVulnerability.id),
  );

  if (existingVulnerability) {
    return existingVulnerability;
  }

  // TODO should fetch vulnerability from `/vulnerabilities/{id} endpoint to create entity.
  return jobState.addEntity(
    createIntegrationEntity({
      entityData: {
        source: assetVulnerability,
        assign: {
          _key: getVulnerabilityKey(assetVulnerability.id),
          _type: entities.VULNERABILITY._type,
          _class: entities.VULNERABILITY._class,
          id: `${assetVulnerability.id}`,
          name: assetVulnerability.id,
          category: 'other',
          severity: 'critical',
          blocking: false,
          open: false,
          production: false,
          public: true,
        },
      },
    }),
  );
}

export async function fetchAssetVulnerabilities({
  instance,
  jobState,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const apiClient = createAPIClient(instance.config);

  await jobState.iterateEntities(
    { _type: entities.ASSET._type },
    async (assetEntity) => {
      await apiClient.iterateVulnerabilities(
        assetEntity.id! as string,
        async (assetVulnerability) => {
          const findingEntity = await jobState.addEntity(
            createAssetVulnerabilityEntity(
              assetVulnerability,
              assetEntity.id! as string,
            ),
          );
          await jobState.addRelationship(
            createDirectRelationship({
              _class: RelationshipClass.HAS,
              from: assetEntity,
              to: findingEntity,
            }),
          );

          const vulnerabilityEntity = await findOrCreateVulnerability(
            jobState,
            assetVulnerability,
          );
          await jobState.addRelationship(
            createDirectRelationship({
              _class: RelationshipClass.IS,
              from: findingEntity,
              to: vulnerabilityEntity,
            }),
          );
        },
      );
    },
  );
}

export const vulnerabilitiesSteps: IntegrationStep<IntegrationConfig>[] = [
  {
    id: steps.FETCH_ASSET_VULNERABILITIES,
    name: 'Fetch Asset Vulnerabilities',
    entities: [entities.FINDING, entities.VULNERABILITY],
    relationships: [
      relationships.ASSET_HAS_FINDING,
      relationships.FINDING_IS_VULNERABILITY,
    ],
    dependsOn: [steps.FETCH_ASSETS],
    executionHandler: fetchAssetVulnerabilities,
  },
];
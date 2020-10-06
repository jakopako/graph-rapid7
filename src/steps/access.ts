import {
  createDirectRelationship,
  createIntegrationEntity,
  Entity,
  IntegrationStep,
  IntegrationStepExecutionContext,
  RelationshipClass,
} from '@jupiterone/integration-sdk-core';

import { createAPIClient } from '../client';
import { IntegrationConfig } from '../types';
import { ACCOUNT_ENTITY_DATA_KEY, entities, relationships } from '../constants';

export function getUserKey(id: number): string {
  return `insightvm_user:${id}`;
}

export async function fetchUsers({
  instance,
  jobState,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const apiClient = createAPIClient(instance.config);

  const accountEntity = (await jobState.getData(
    ACCOUNT_ENTITY_DATA_KEY,
  )) as Entity;

  await apiClient.iterateUsers(async (user) => {
    const webLink = user.links.find((link) => link.rel === 'self')?.href;

    const userEntity = createIntegrationEntity({
      entityData: {
        source: user,
        assign: {
          _key: getUserKey(user.id),
          _type: entities.USER._type,
          _class: entities.USER._class,
          id: `${user.id}`,
          username: user.login,
          email: user.email,
          webLink,
        },
      },
    });

    await Promise.all([
      jobState.addEntity(userEntity),
      jobState.addRelationship(
        createDirectRelationship({
          _class: RelationshipClass.HAS,
          from: accountEntity,
          to: userEntity,
        }),
      ),
    ]);
  });
}

export const accessSteps: IntegrationStep<IntegrationConfig>[] = [
  {
    id: 'fetch-users',
    name: 'Fetch Users',
    entities: [entities.USER],
    relationships: [relationships.ACCOUNT_HAS_USER],
    dependsOn: ['fetch-account'],
    executionHandler: fetchUsers,
  },
];

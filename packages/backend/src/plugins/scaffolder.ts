/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  CookieCutter,
  createRouter,
  FilePreparer,
  GithubPreparer,
  GitlabPreparer,
  AzurePreparer,
  Preparers,
  Publishers,
  GithubPublisher,
  GitlabPublisher,
  AzurePublisher,
  CreateReactAppTemplater,
  Templaters,
  RepoVisibilityOptions,
} from '@backstage/plugin-scaffolder-backend';
import { Octokit } from '@octokit/rest';
import { Gitlab } from '@gitbeaker/node';
import { getPersonalAccessTokenHandler, WebApi } from 'azure-devops-node-api';
import type { PluginEnvironment } from '../types';
import Docker from 'dockerode';

export default async function createPlugin({
  logger,
  config,
}: PluginEnvironment) {
  const cookiecutterTemplater = new CookieCutter();
  const craTemplater = new CreateReactAppTemplater();
  const templaters = new Templaters();
  templaters.register('cookiecutter', cookiecutterTemplater);
  templaters.register('cra', craTemplater);

  const filePreparer = new FilePreparer();

  const gitlabPreparer = new GitlabPreparer(config);
  const azurePreparer = new AzurePreparer(config);
  const preparers = new Preparers();

  preparers.register('file', filePreparer);
  preparers.register('gitlab', gitlabPreparer);
  preparers.register('gitlab/api', gitlabPreparer);
  preparers.register('azure/api', azurePreparer);

  const publishers = new Publishers();

  const githubConfig = config.getOptionalConfig('scaffolder.github');

  if (githubConfig) {
    try {
      const repoVisibility = githubConfig.getString(
        'visibility',
      ) as RepoVisibilityOptions;

      const githubToken = githubConfig.getString('token');
      const githubClient = new Octokit({ auth: githubToken });
      const githubPublisher = new GithubPublisher({
        client: githubClient,
        token: githubToken,
        repoVisibility,
      });

      const githubPreparer = new GithubPreparer({ token: githubToken });

      preparers.register('github', githubPreparer);
      publishers.register('file', githubPublisher);
      publishers.register('github', githubPublisher);
    } catch (e) {
      const providerName = 'github';
      if (process.env.NODE_ENV !== 'development') {
        throw new Error(
          `Failed to initialize ${providerName} scaffolding provider, ${e.message}`,
        );
      }

      logger.warn(
        `Skipping ${providerName} scaffolding provider, ${e.message}`,
      );
    }
  }

  const gitLabConfig = config.getOptionalConfig('scaffolder.gitlab.api');
  if (gitLabConfig) {
    try {
      const gitLabToken = gitLabConfig.getString('token');
      const gitLabClient = new Gitlab({
        host: gitLabConfig.getOptionalString('baseUrl'),
        token: gitLabToken,
      });
      const gitLabPublisher = new GitlabPublisher(gitLabClient, gitLabToken);
      publishers.register('gitlab', gitLabPublisher);
      publishers.register('gitlab/api', gitLabPublisher);
    } catch (e) {
      const providerName = 'gitlab';
      if (process.env.NODE_ENV !== 'development') {
        throw new Error(
          `Failed to initialize ${providerName} scaffolding provider, ${e.message}`,
        );
      }

      logger.warn(
        `Skipping ${providerName} scaffolding provider, ${e.message}`,
      );
    }
  }

  const azureConfig = config.getOptionalConfig('scaffolder.azure');
  if (azureConfig) {
    try {
      const baseUrl = azureConfig.getString('baseUrl');
      const azureToken = azureConfig.getConfig('api').getString('token');

      const authHandler = getPersonalAccessTokenHandler(azureToken);
      const webApi = new WebApi(baseUrl, authHandler);
      const azureClient = await webApi.getGitApi();

      const azurePublisher = new AzurePublisher(azureClient, azureToken);
      publishers.register('azure/api', azurePublisher);
    } catch (e) {
      const providerName = 'azure';
      if (process.env.NODE_ENV !== 'development') {
        throw new Error(
          `Failed to initialize ${providerName} scaffolding provider, ${e.message}`,
        );
      }

      logger.warn(
        `Skipping ${providerName} scaffolding provider, ${e.message}`,
      );
    }
  }

  const dockerClient = new Docker();
  return await createRouter({
    preparers,
    templaters,
    publishers,
    logger,
    dockerClient,
  });
}

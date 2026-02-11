/**
 * GraphQL query strings for The Graph Network Subgraph.
 *
 * These are plain strings (not gql tagged templates) for use with graphql-request.
 */

export const GET_GRAPH_NETWORK = `
  query {
    graphNetwork(id: 1) {
      totalTokensSignalled
      networkGRTIssuancePerBlock
      totalSupply
      currentEpoch
      totalTokensAllocated
      maxThawingPeriod
    }
  }
`;

export const GET_SUBGRAPHS = `
  query subgraphDeploymentManifests(
    $cursor: String!
    $minSignal: String!
    $networks: [String]
  ) {
    subgraphDeploymentManifests(
      first: 1000
      orderBy: "id"
      where: {
        id_gt: $cursor
        deployment_: { signalledTokens_gt: $minSignal }
        network_in: $networks
      }
    ) {
      id
      deployment {
        id
        deniedAt
        createdAt
        indexingRewardAmount
        ipfsHash
        queryFeesAmount
        signalledTokens
        stakedTokens
        manifest {
          network
          poweredBySubstreams
        }
        versions(first: 1, orderBy: version, orderDirection: desc) {
          metadata {
            subgraphVersion {
              subgraph {
                metadata {
                  displayName
                  image
                  description
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_SUBGRAPHS_NO_NETWORK_FILTER = `
  query subgraphDeploymentManifests($cursor: String!, $minSignal: String!) {
    subgraphDeploymentManifests(
      first: 1000
      orderBy: "id"
      where: {
        id_gt: $cursor
        deployment_: { signalledTokens_gt: $minSignal }
      }
    ) {
      id
      deployment {
        id
        deniedAt
        createdAt
        indexingRewardAmount
        ipfsHash
        queryFeesAmount
        signalledTokens
        stakedTokens
        manifest {
          network
          poweredBySubstreams
        }
        versions(first: 1, orderBy: version, orderDirection: desc) {
          metadata {
            subgraphVersion {
              subgraph {
                metadata {
                  displayName
                  image
                  description
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_ALLOCATIONS = `
  query allocations($indexer: String!, $skip: Int!) {
    allocations(
      first: 1000
      where: { activeForIndexer_contains_nocase: $indexer, status: Active }
      orderBy: createdAtBlockNumber
      orderDirection: desc
      skip: $skip
    ) {
      id
      activeForIndexer {
        id
      }
      subgraphDeployment {
        versions(first: 1, orderBy: version, orderDirection: desc) {
          subgraph {
            id
            currentVersion {
              subgraphDeployment {
                ipfsHash
              }
            }
            metadata {
              image
              displayName
            }
          }
        }
        ipfsHash
        createdAt
        originalName
        stakedTokens
        indexingRewardAmount
        signalledTokens
        queryFeesAmount
        deniedAt
        manifest {
          network
        }
      }
      allocatedTokens
      effectiveAllocation
      createdAt
      createdAtEpoch
      createdAtBlockHash
      createdAtBlockNumber
      indexingRewards
      indexingIndexerRewards
      indexingDelegatorRewards
      isLegacy
    }
  }
`;

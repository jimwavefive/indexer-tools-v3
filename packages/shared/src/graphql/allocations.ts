import gql from 'graphql-tag';

export const GET_ALLOCATIONS = gql`
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

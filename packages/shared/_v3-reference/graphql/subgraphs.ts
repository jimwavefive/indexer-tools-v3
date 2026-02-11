import gql from 'graphql-tag';

export const GET_SUBGRAPHS = gql`
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

export const GET_SUBGRAPHS_NO_NETWORK_FILTER = gql`
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

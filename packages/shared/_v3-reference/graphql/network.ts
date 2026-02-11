import gql from 'graphql-tag';

export const GET_GRAPH_NETWORK = gql`
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

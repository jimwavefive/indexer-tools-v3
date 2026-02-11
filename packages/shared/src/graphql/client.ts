import { GraphQLClient } from 'graphql-request';

/**
 * Create a GraphQL client for a given URL.
 * Replaces Apollo Client with the lightweight graphql-request library.
 */
export function createGraphClient(url: string): GraphQLClient {
  return new GraphQLClient(url, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

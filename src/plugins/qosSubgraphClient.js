import { loadDefaultsConfig, replaceAPI } from "./defaultsConfig";
import { ApolloClient, createHttpLink, InMemoryCache, from as apolloFrom } from '@apollo/client/core'
import { retryLink } from './retryLink';

const defaultsConfigVariables = await loadDefaultsConfig();
const defaultsConfig = defaultsConfigVariables.variables;

// HTTP connection to the API
const httpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.qosSubgraph, defaultsConfig.apiKey),
});

const cache = new InMemoryCache();

export const qosSubgraphClient = new ApolloClient({
  link: apolloFrom([retryLink, httpLink]),
  cache,
});

import { loadDefaultsConfig, replaceAPI } from "./defaultsConfig";
import { ApolloClient, createHttpLink, InMemoryCache, from as apolloFrom } from '@apollo/client/core'
import { retryLink } from './retryLink';

const defaultsConfigVariables = await loadDefaultsConfig();
const defaultsConfig = defaultsConfigVariables.variables;
// HTTP connection to the API
const httpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.subgraphMainnet, defaultsConfig.apiKey),
});

const arbitrumHttpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.subgraphArbitrum, defaultsConfig.apiKey),
});

const sepoliaHttpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.subgraphSepolia, defaultsConfig.apiKey),
});

const arbitrumSepoliaHttpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.subgraphArbitrumSepolia, defaultsConfig.apiKey),
});

// Cache implementation
const cache = new InMemoryCache();
const arbitrumCache = new InMemoryCache();
const sepoliaCache = new InMemoryCache();
const arbitrumSepoliaCache = new InMemoryCache();

// Create the apollo client
export const apolloClient = new ApolloClient({
  link: apolloFrom([retryLink, httpLink]),
  cache,
});

export const arbitrumApolloClient = new ApolloClient({
  link: apolloFrom([retryLink, arbitrumHttpLink]),
  cache: arbitrumCache,
});

export const sepoliaApolloClient = new ApolloClient({
  link: apolloFrom([retryLink, sepoliaHttpLink]),
  cache: sepoliaCache,
});

export const arbitrumSepoliaApolloClient = new ApolloClient({
  link: apolloFrom([retryLink, arbitrumSepoliaHttpLink]),
  cache: arbitrumSepoliaCache,
});

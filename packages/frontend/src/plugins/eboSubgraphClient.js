import { loadDefaultsConfig, replaceAPI } from "./defaultsConfig";
import { ApolloClient, createHttpLink, InMemoryCache, from as apolloFrom } from '@apollo/client/core'
import { retryLink } from './retryLink';

const defaultsConfigVariables = await loadDefaultsConfig();
const defaultsConfig = defaultsConfigVariables.variables;

// HTTP connection to the API
const httpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.eboMainnet, defaultsConfig.apiKey),
});

const arbitrumHttpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.eboArbitrum, defaultsConfig.apiKey),
});

const sepoliaHttpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.eboSepolia, defaultsConfig.apiKey),
});

const arbitrumSepoliaHttpLink = createHttpLink({
  uri: replaceAPI(defaultsConfig.eboArbitrumSepolia, defaultsConfig.apiKey),
});

// Cache implementation
const cache = new InMemoryCache();
const arbitrumCache = new InMemoryCache();
const sepoliaCache = new InMemoryCache();
const arbitrumSepoliaCache = new InMemoryCache();

// Create the apollo client
export const mainnetEboClient = new ApolloClient({
  link: apolloFrom([retryLink, httpLink]),
  cache,
});

export const arbitrumEboClient = new ApolloClient({
  link: apolloFrom([retryLink, arbitrumHttpLink]),
  cache: arbitrumCache,
});

export const sepoliaEboClient = new ApolloClient({
  link: apolloFrom([retryLink, sepoliaHttpLink]),
  cache: sepoliaCache,
});

export const arbitrumSepoliaEboClient = new ApolloClient({
  link: apolloFrom([retryLink, arbitrumSepoliaHttpLink]),
  cache: arbitrumSepoliaCache,
});

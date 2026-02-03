import gql from 'graphql-tag';
import { qosSubgraphClient } from "@/plugins/qosSubgraphClient";

const LATEST_DAY_QUERY = gql`query{
  queryDailyDataPoints(orderBy: dayNumber, first: 1, orderDirection: desc) {
    dayNumber
  }
}`;

let cachedPromise = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

export function getLatestDayNumber() {
  const now = Date.now();
  if (cachedPromise && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPromise;
  }
  cacheTimestamp = now;
  cachedPromise = qosSubgraphClient.query({
    query: LATEST_DAY_QUERY,
  }).then(({ data }) => data.queryDailyDataPoints[0].dayNumber - 1)
    .catch((err) => {
      // Invalidate cache on error so next call retries
      cachedPromise = null;
      throw err;
    });
  return cachedPromise;
}

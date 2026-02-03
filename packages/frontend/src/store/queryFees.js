import { defineStore } from 'pinia'
import { useSubgraphSettingStore } from './subgraphSettings';
import gql from 'graphql-tag';
import { qosSubgraphClient } from "@/plugins/qosSubgraphClient";
import { getLatestDayNumber } from "@/plugins/latestDayCache";
import { useNotificationStore } from './notifications';


const subgraphSettingStore = useSubgraphSettingStore();
const notificationStore = useNotificationStore();

const QOS_QUERY_NO_FILTER = gql`query queryDailyDataPoints($dayNumber: Int!){
  queryDailyDataPoints(
    orderBy: total_query_fees
    where: {dayNumber: $dayNumber}
    orderDirection: desc,
    first: 1000
  ) {
    dayNumber
    chain_id
    avg_query_fee
    avg_gateway_latency_ms
    gateway_query_success_rate
    query_count
    total_query_fees
    subgraphDeployment {
      id
    }
  }
}`;
const QOS_QUERY = gql`query queryDailyDataPoints($dayNumber: Int!, $networkFilter: [String]!){
  queryDailyDataPoints(
    orderBy: total_query_fees
    where: {dayNumber: $dayNumber, chain_id_in: $networkFilter}
    orderDirection: desc,
    first: 1000
  ) {
    dayNumber
    chain_id
    avg_query_fee
    avg_gateway_latency_ms
    gateway_query_success_rate
    query_count
    total_query_fees
    subgraphDeployment {
      id
    }
  }
}`;

export const useQueryFeesStore = defineStore('queryFeeStore', {
  state: () => ({
    queryFeeData: [],
    loading: true,
    error: false,
  }),
  getters: {
    getQueryFeeDict: (state) => {
      let dict = {};
      state.queryFeeData.forEach(
        (el) => (dict[el.subgraphDeployment.id] = el )
      );
      return dict;
    },
  },
  actions: {
    async fetchData(){
      this.error = true;
      this.loading = true;

      return getLatestDayNumber()
      .then((dayNumber) => {
        return qosSubgraphClient.query({
          query: subgraphSettingStore.settings.queryFilters.networkFilter.length > 0 ? QOS_QUERY : QOS_QUERY_NO_FILTER,
          variables: {
            dayNumber: dayNumber,
            networkFilter: subgraphSettingStore.settings.queryFilters.networkFilter,
          }
        }).then(({ data }) => {
          this.queryFeeData = data.queryDailyDataPoints;
          this.loading = false;
          return data.queryDailyDataPoints;
        })
      }).catch((err) => {
        this.loading = false;
        if(err.graphQLErrors[0]?.message){
          console.error(`Query fee API error: ${err.graphQLErrors[0].message}`)
          if(!this.error){
            notificationStore.error(`Query Fee API Error: ${err.graphQLErrors[0].message}`);
            this.error = true;
          }
        }
        if(err.message){
          console.error(`Query fee query error: ${err.message}`);
          if(!this.error){
            notificationStore.error(`Query Fee Error: ${err.message}`);
            this.error = true;
          }
        }
      });
    }
  },
})

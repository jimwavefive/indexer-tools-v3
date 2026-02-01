<template>
  <div>
  <v-card>
      <v-toolbar
      flat
      color="#5a3c57"
      dark
      >
      <v-toolbar-title>Settings</v-toolbar-title>
      </v-toolbar>
      <div class="d-flex flex-row">
        <v-tabs 
        direction="vertical" 
        v-model="tab"
        >
          <v-tab value="general">
            <v-icon start>
            mdi-cog
            </v-icon>
            General
          </v-tab>
          <v-tab value="dashboards">
            <v-icon start>
              mdi-view-column
            </v-icon>
            Dashboards
          </v-tab>
          <v-tab value="accounts">
            <v-icon start>
            mdi-account
            </v-icon>
            Accounts
          </v-tab>
          <v-tab value="custom-rpc">
            <v-icon start>
              mdi-wifi
            </v-icon>
            Custom RPCs
          </v-tab>
          <v-tab value="chain-validation-rpc">
            <v-icon start>
              mdi-check-network
            </v-icon>
            Chain Validation RPCs
          </v-tab>
        </v-tabs>
        <v-window v-model="tab">
          <v-window-item value="general">
            <v-card flat>
            <v-card-text>
                <v-switch
                v-model="subgraphSettingsStore.settings.automaticIndexingRewards"
                :label="`Automatic Indexing Rewards*`"
                class="mb-0"
                ></v-switch>
                <p class="mb-8">
                    * Only functions with custom RPCs<br>
                    (Disable if there are issues with allocation wizard)
                </p>
                <v-select
                  v-model="appStore.autoRefreshInterval"
                  :items="[{title: 'Off', value: 0}, {title: '1 minute', value: 60000}, {title: '2 minutes', value: 120000}, {title: '5 minutes', value: 300000}, {title: '10 minutes', value: 600000}]"
                  label="Auto-Refresh Interval"
                  class="mb-4"
                  style="max-width: 15rem;"
                  @update:model-value="(v) => appStore.setAutoRefreshInterval(v)"
                ></v-select>
                <h3>Subgraph Sync List (Manual)</h3>
                <v-textarea rows="3" v-model="subgraphSettingsStore.settings.subgraphSynclist"></v-textarea>
                <h3>Subgraph Blacklist (from file)</h3>
                <v-textarea
                  v-if="subgraphSettingsStore.fileBlacklist.length"
                  rows="3"
                  :model-value="subgraphSettingsStore.fileBlacklist.join('\n')"
                  readonly
                  variant="outlined"
                  bg-color="grey-darken-3"
                ></v-textarea>
                <p v-if="subgraphSettingsStore.fileBlacklist.length" class="text-caption text-grey mb-4">Loaded from blacklist.txt ({{ subgraphSettingsStore.fileBlacklist.length }} entries)</p>
                <p v-else class="text-caption text-grey mb-4">No blacklist file loaded</p>
                <h3>Subgraph Blacklist (Manual)</h3>
                <v-textarea rows="3" v-model="subgraphSettingsStore.settings.subgraphBlacklist"></v-textarea>
            </v-card-text>
            </v-card>
          </v-window-item>
          <v-window-item value="accounts">
            <v-card flat>
            <v-card-text style="width:450px">
                <AccountsEdit></AccountsEdit>
            </v-card-text>
            </v-card>
          </v-window-item>
          <v-window-item value="custom-rpc">
            <v-card flat>
            <v-card-text>
                <p>
                Use your own RPCs if the default are rate limited or you'd like to use auto indexing rewards feature
                </p>
                <br>
                <p>Mainnet</p>
                <v-row>
                  <v-checkbox v-model="mainnet_rpc_c"></v-checkbox>
                  <v-text-field v-if="mainnet_rpc_c" v-model="subgraphSettingsStore.settings.rpc.mainnet" @change="updateMainnetRPC"></v-text-field>
                </v-row>
                <p>Arbitrum</p>
                <v-row>
                  <v-checkbox v-model="arbitrum_rpc_c"></v-checkbox>
                  <v-text-field v-if="arbitrum_rpc_c" v-model="subgraphSettingsStore.settings.rpc.arbitrum" @change="updateArbitrumRPC"></v-text-field>
                </v-row>
            </v-card-text>
            </v-card>
          </v-window-item>
          <v-window-item value="chain-validation-rpc">
            <v-card flat>
            <v-card-text>
                <p class="mb-4">
                  Set custom RPC endpoints for chain validation instead of using the default DRPC provider.
                  Use your own nodes (e.g. via eRPC) for reliable block hash verification.
                </p>
                <div v-for="chain in chainValidationChains" :key="chain.id" class="mb-2">
                  <p>{{ chain.label }}</p>
                  <v-row>
                    <v-checkbox v-model="chainValidationEnabled[chain.id]" @update:model-value="(v) => { if(!v) clearChainValidationRpc(chain.id) }"></v-checkbox>
                    <v-text-field
                      v-if="chainValidationEnabled[chain.id]"
                      v-model="subgraphSettingsStore.settings.chainValidationRpcs[chain.id]"
                      :placeholder="chain.placeholder"
                    ></v-text-field>
                  </v-row>
                </div>
            </v-card-text>
            </v-card>
          </v-window-item>
          <v-window-item value="dashboards">
            <div class="d-inline-flex flex-wrap justify-space-around">
              <v-card class="w-50 mx-5" style="min-width: 300px;max-width:500px">
                <header class="d-flex align-center">
                  <h2 class="mx-4">Allocation Columns</h2>
                  <v-btn
                    @click="subgraphSettingsStore.resetAllocationDefaultColumns()"
                    class="ma-5"
                    size="large"
                  >
                    Reset Columns
                  </v-btn>
                </header>       
                <v-select
                    v-model="subgraphSettingsStore.settings.selectedAllocationColumns"
                    :items="allocationsDashboardColumns"
                    label="Allocations Dashboard Columns"
                    multiple
                    class="d-inline-block mx-4"
                    style="min-width:13rem;top: -5px"
                    item-value="title"
                    key="key"
                    return-object
                ></v-select>
                <Sortable
                  :list="subgraphSettingsStore.settings.selectedAllocationColumns"
                  item-key="key"
                  tag="div"
                  @end="onAllocationsUpdate"
                >
                  <template #item="{element}">
                    <v-list-item
                      rounded="lg"
                      class="draggable w-90 mx-3"
                      :key="element.key"
                      :title="element.title"
                      density="compact"
                    >
                      <template v-slot:append>
                        <v-icon 
                          icon="mdi-close"
                          @click="removeColumn('selectedAllocationColumns', element.key)"
                        >

                        </v-icon>
                      </template>
                    </v-list-item>
                  </template>
                </Sortable>
              </v-card>
              <v-card class="w-50" style="min-width: 300px;max-width:500px">
                <header class="d-flex align-center">
                  <h2 class="mx-4">Subgraph Columns</h2>
                  <v-btn
                    @click="subgraphSettingsStore.resetSubgraphDefaultColumns()"
                    class="ma-5"
                    size="large"
                  >
                    Reset Columns
                  </v-btn>
                </header>
                <v-select
                    v-model="subgraphSettingsStore.settings.selectedSubgraphColumns"
                    :items="subgraphsDashboardColumns"
                    label="Subgraphs Dashboard Columns"
                    multiple
                    class="d-inline-block mx-4"
                    style="min-width:13rem;top: -5px"
                    item-value="title"
                    key="key"
                    return-object
                ></v-select>
                <Sortable
                  :list="subgraphSettingsStore.settings.selectedSubgraphColumns"
                  item-key="key"
                  tag="div"
                  @end="onSubgraphsUpdate"
                >
                  <template #item="{element}">
                      <v-list-item
                        rounded="lg"
                        class="draggable w-90 mx-3"
                        :key="element.key"
                        :title="element.title"
                      >
                      <template v-slot:append>
                        <v-icon 
                          icon="mdi-close"
                          @click="removeColumn('selectedSubgraphColumns', element.key)"
                        >

                        </v-icon>
                      </template>
                      </v-list-item>
                    </template>
                </Sortable>
              </v-card>
            </div>
          </v-window-item>
        </v-window>
      </div>
    </v-card>
  </div>
  </template>
  
  <script setup>
  import AccountsEdit from '@/components/AccountsEdit.vue';
  import { useSubgraphSettingStore } from '@/store/subgraphSettings';
  import { useChainStore } from '@/store/chains';
  import { useAppStore } from '@/store/app';
  import { ref } from 'vue';
  import { storeToRefs } from 'pinia';
  import Web3 from 'web3';
  import { allocationsDashboardColumns, subgraphsDashboardColumns } from '@/plugins/dashboardColumns';
  import { Sortable } from "sortablejs-vue3";
  
  const subgraphSettingsStore = useSubgraphSettingStore();
  const subgraphSettings = storeToRefs(subgraphSettingsStore);
  const chainStore = useChainStore();
  const appStore = useAppStore();
  const tab = ref("general");
  const mainnet_rpc_c = ref(subgraphSettingsStore.settings.rpc.mainnet != '');
  const arbitrum_rpc_c = ref(subgraphSettingsStore.settings.rpc.arbitrum != '');

  // Ensure chainValidationRpcs exists in settings
  if (!subgraphSettingsStore.settings.chainValidationRpcs) {
    subgraphSettingsStore.settings.chainValidationRpcs = {};
  }

  const chainValidationChains = [
    { id: 'mainnet', label: 'Ethereum Mainnet', placeholder: 'https://ethereum.erpc.example.com:8555' },
    { id: 'arbitrum-one', label: 'Arbitrum One', placeholder: 'https://arbitrum.erpc.example.com:8555' },
    { id: 'matic', label: 'Polygon', placeholder: 'https://polygon.erpc.example.com:8555' },
    { id: 'gnosis', label: 'Gnosis', placeholder: 'https://gnosis.erpc.example.com:8555' },
    { id: 'base', label: 'Base', placeholder: 'https://base.erpc.example.com:8555' },
    { id: 'sepolia', label: 'Sepolia', placeholder: 'https://sepolia.erpc.example.com:8555' },
    { id: 'arbitrum-sepolia', label: 'Arbitrum Sepolia', placeholder: 'https://arb-sepolia.erpc.example.com:8555' },
  ];

  const chainValidationEnabled = ref(
    Object.fromEntries(chainValidationChains.map(c => [c.id, !!subgraphSettingsStore.settings.chainValidationRpcs[c.id]]))
  );

  function clearChainValidationRpc(chainId) {
    delete subgraphSettingsStore.settings.chainValidationRpcs[chainId];
  }


  function onSubgraphsUpdate(event) { subgraphSettingsStore.moveItemInSubgraphColumns(event.oldIndex, event.newIndex) }
  function onAllocationsUpdate(event) { subgraphSettingsStore.moveItemInAllocationColumns(event.oldIndex, event.newIndex) }

  function updateMainnetRPC(rpc){
    if(rpc != '' && new Web3(rpc))
      chainStore.chains[0].web3 = new Web3(rpc);
    else
      chainStore.chains[0].web3 = new Web3(chainStore.chains[0].default_rpc);
  }
  function updateArbitrumRPC(rpc){
    if(rpc != '' && new Web3(rpc))
      chainStore.chains[1].web3 = new Web3(rpc);
    else
      chainStore.chains[1].web3 = new Web3(chainStore.chains[1].default_rpc);
  }

  function removeColumn(columns, key){
    subgraphSettingsStore.settings[columns] = subgraphSettingsStore.settings[columns].filter((e) => e.key != key);
  }
  </script>
  
  <style scoped>
  .draggable {
    /*background: #fff;*/
    padding: 5px;
    margin: 10px;
    border: 1px solid #ccc;
    cursor: move;
  }
  </style>
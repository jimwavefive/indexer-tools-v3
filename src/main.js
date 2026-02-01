/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

import { loadDefaultsConfig, defaultsConfig } from "@/plugins/defaultsConfig";
import { useSubgraphSettingStore } from '@/store/subgraphSettings';

const defaultConfigOptions = await loadDefaultsConfig();

const app = createApp(App)

app.use(defaultsConfig, defaultConfigOptions);

registerPlugins(app)

// Pass file-based blacklist entries to the subgraphSettings store
const subgraphSettingStore = useSubgraphSettingStore();
if (defaultConfigOptions.variables.subgraphBlacklist && defaultConfigOptions.variables.subgraphBlacklist.length) {
  subgraphSettingStore.setFileBlacklist(defaultConfigOptions.variables.subgraphBlacklist);
}

app.mount('#app')

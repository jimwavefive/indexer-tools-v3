import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import 'primeicons/primeicons.css';

import App from './App.vue';
import router from './router';
import { loadRuntimeConfig } from '../plugins/defaults';

// Load runtime config before mounting (fetches /indexer-tools-config.json + /blacklist.txt)
await loadRuntimeConfig();

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark-mode',
    },
  },
});
app.use(ToastService);

app.mount('#app');

/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'
import { VDataTable } from 'vuetify/components/VDataTable'

const savedTheme = localStorage.getItem('theme') || 'dark';

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: savedTheme,
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#5a3c57',
          secondary: '#424242',
          surface: '#FFFFFF',
          background: '#f5f5f5',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#5a3c57',
        },
      },
    },
  },
  components: {
    VDataTable
  }
})

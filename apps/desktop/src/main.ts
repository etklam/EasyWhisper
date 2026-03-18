import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { naive } from './plugins/naive'
import { router } from './router'
import i18n from './i18n'

import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(naive)
app.use(i18n)
app.mount('#app')

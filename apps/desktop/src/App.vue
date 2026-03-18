<template>
  <n-config-provider :locale="naiveLocale">
    <n-message-provider>
      <div class="app-shell">
        <header class="shell-header">
          <div>
            <h1>{{ t('app.title') }}</h1>
            <p>{{ subtitle }}</p>
          </div>

          <n-button
            v-if="isSettings"
            data-testid="back-workspace"
            secondary
            @click="goHome"
          >
            {{ t('nav.backToWorkspace') }}
          </n-button>
          <n-button
            v-else
            data-testid="open-settings"
            secondary
            @click="goSettings"
          >
            {{ t('nav.openSettings') }}
          </n-button>
        </header>

        <main class="shell-content">
          <router-view />
        </main>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getNaiveLocale } from '@/utils/i18n-helpers'
import { useLocale } from '@/composables/useLocale'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const isSettings = computed(() => route.name === 'settings')
const subtitle = computed(() =>
  isSettings.value ? t('app.subtitleSettings') : t('app.subtitleHome')
)
const naiveLocale = computed(() => getNaiveLocale(locale.value))

const { initializeLocale } = useLocale()

onMounted(() => {
  initializeLocale()
})

function goHome() {
  void router.push({ name: 'home' })
}

function goSettings() {
  void router.push({ name: 'settings' })
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdfa 0%, #f8fafc 38%, #ffffff 100%);
  color: #0f172a;
  padding: 20px;
  display: grid;
  gap: 16px;
}

.shell-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.shell-header h1 {
  margin: 0;
  font-size: 30px;
}

.shell-header p {
  margin: 6px 0 0;
  color: #334155;
}

.shell-content {
  min-height: 0;
}

@media (max-width: 720px) {
  .shell-header {
    display: grid;
  }
}
</style>

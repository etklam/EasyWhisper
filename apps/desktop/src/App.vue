<template>
  <n-config-provider :locale="naiveLocale">
    <n-message-provider>
      <div class="app-shell">
        <header class="shell-header">
          <div class="shell-intro">
            <div class="eyebrow">{{ t('app.shellEyebrow') }}</div>
            <h1>{{ t('app.title') }}</h1>
            <p>{{ subtitle }}</p>
          </div>

          <n-button
            v-if="isSettings"
            data-testid="back-workspace"
            secondary
            class="shell-action"
            @click="goHome"
          >
            {{ t('nav.backToWorkspace') }}
          </n-button>
          <n-button
            v-else
            data-testid="open-settings"
            secondary
            class="shell-action"
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
import { getNaiveLocale, type SupportedLocale } from '@/utils/i18n-helpers'
import { useLocale } from '@/composables/useLocale'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const isSettings = computed(() => route.name === 'settings')
const subtitle = computed(() =>
  isSettings.value ? t('app.subtitleSettings') : t('app.subtitleHome')
)
const naiveLocale = computed(() => getNaiveLocale(locale.value as SupportedLocale))

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
  color: var(--fw-text);
  padding: 28px;
  display: grid;
  gap: 20px;
  position: relative;
}

.app-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.08), transparent 30%),
    radial-gradient(circle at bottom right, rgba(5, 150, 105, 0.08), transparent 26%);
  z-index: -1;
}

.shell-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid var(--fw-border);
  border-radius: var(--fw-radius-xl);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(236, 254, 255, 0.82));
  box-shadow: var(--fw-shadow);
  backdrop-filter: blur(18px);
}

.shell-intro {
  min-width: 0;
}

.eyebrow {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fw-primary-strong);
}

.shell-header h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.05;
  color: var(--fw-title);
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
}

.shell-header p {
  margin: 6px 0 0;
  max-width: 56ch;
  color: var(--fw-text-muted);
}

.shell-action {
  border-radius: 999px;
  min-width: 148px;
}

.shell-content {
  min-height: 0;
}

@media (max-width: 720px) {
  .shell-header {
    display: grid;
  }

  .app-shell {
    padding: 16px;
  }
}
</style>

import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import i18n from '@/i18n'
import { naive } from '@/plugins/naive'
import { router } from '@/router'

vi.mock('@/views/HomeView.vue', () => ({
  default: {
    template: '<div data-testid="home-view">Home View</div>'
  }
}))

vi.mock('@/views/SettingsView.vue', () => ({
  default: {
    template: '<div data-testid="settings-view">Settings View</div>'
  }
}))

describe('App navigation shell', () => {
  it('registers /settings route', () => {
    const hasSettingsRoute = router
      .getRoutes()
      .some((route) => route.path === '/settings' && route.name === 'settings')

    expect(hasSettingsRoute).toBe(true)
  })

  it('navigates to settings from home header action and renders settings view', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router, naive, i18n]
      }
    })

    const openSettingsButton = wrapper.get('[data-testid="open-settings"]')
    await openSettingsButton.trigger('click')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe('settings')
      expect(wrapper.get('[data-testid="settings-view"]').text()).toContain('Settings View')
    })
  })

  it('navigates back to workspace from settings header action', async () => {
    await router.push('/settings')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router, naive, i18n]
      }
    })

    const backButton = wrapper.get('[data-testid="back-workspace"]')
    await backButton.trigger('click')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe('home')
      expect(wrapper.get('[data-testid="home-view"]').text()).toContain('Home View')
    })
  })
})

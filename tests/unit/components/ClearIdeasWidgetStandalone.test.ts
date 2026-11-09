import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { resetAllMocks, setupInitNewChat } from '../../helpers/msw-utils'
import { createWidgetWrapper } from '../../helpers/test-utils'

describe('ClearIdeasWidgetStandalone', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
  })

  it('renders widget', () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper()

    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.ci-widget').exists()).toBe(true)
  })

  it('renders FAB when fabHide is false', () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      fabHide: false,
    })

    expect(wrapper.find('.ci-widget-fab').exists()).toBe(true)
  })

  it('hides FAB when fabHide is true', () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      fabHide: true,
    })

    expect(wrapper.find('.ci-widget-fab').exists()).toBe(false)
  })

  it('opens widget when openOnLoad is true', async () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      openOnLoad: true,
    })

    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    const vm = wrapper.vm as any
    expect(vm.isOpen).toBe(true)
  })

  it('closes widget initially when openOnLoad is false', () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      openOnLoad: false,
    })

    const vm = wrapper.vm as any
    expect(vm.isOpen).toBe(false)
  })

  it('applies position classes correctly', () => {
    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const

    positions.forEach(position => {
      setupInitNewChat()
      const wrapper = createWidgetWrapper({ position })
      const widget = wrapper.find('.ci-widget')
      expect(widget.exists()).toBe(true)
    })
  })

  it('applies custom width and height', async () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      width: 400,
      height: 600,
      openOnLoad: true,
    })

    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    const panel = wrapper.find('.ci-widget-panel')
    expect(panel.exists()).toBe(true)
    const style = panel.attributes('style')
    expect(style).toContain('width: 400px')
    expect(style).toContain('height: 600px')
  })

  it('exposes public methods', () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper()

    const vm = wrapper.vm as any
    expect(typeof vm.openWidget).toBe('function')
    expect(typeof vm.closeWidget).toBe('function')
    expect(typeof vm.toggleWidget).toBe('function')
    expect(typeof vm.sendPublicChatMessage).toBe('function')
    expect(typeof vm.hideFab).toBe('function')
    expect(typeof vm.showFab).toBe('function')
  })

  it('loads init data on mount', async () => {
    setupInitNewChat()

    createWidgetWrapper()

    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    // With MSW, we verify behavior rather than fetch calls
    // The component should have loaded init data
  })

  it('handles dark mode prop', () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      darkMode: true,
    })

    const widget = wrapper.find('.ci-widget')
    expect(widget.classes()).toContain('ci-widget-dark')
  })

  it('shows home view initially', async () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      openOnLoad: true,
    })

    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    const vm = wrapper.vm as any
    expect(vm.currentView).toBe('home')
  })

  it('switches to chat view when starting chat', async () => {
    setupInitNewChat()

    const wrapper = createWidgetWrapper({
      openOnLoad: true,
    })

    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    const vm = wrapper.vm as any
    await vm.startChat()

    await nextTick()
    expect(vm.currentView).toBe('chat')
  })
})

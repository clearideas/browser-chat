import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WidgetHeader from '@/components/WidgetHeader.vue'

import { mockInitResponseNewChat } from '../../fixtures/api-responses'

describe('WidgetHeader', () => {
  const defaultProps = {
    currentView: 'home' as const,
    initData: mockInitResponseNewChat,
    widgetChatName: 'Test Bot',
    widgetColorBase: 'rgb(40, 102, 207)',
    widgetColorLight: 'rgb(70, 132, 237)',
    widgetColorDark: 'rgb(20, 72, 177)',
    headerContrastColor: 'rgb(255, 255, 255)',
    displayName: 'User',
  }

  it('renders header', () => {
    const wrapper = mount(WidgetHeader, {
      props: defaultProps,
    })

    const header = wrapper.find('.ci-widget-panel__header')
    expect(header.exists()).toBe(true)
  })

  it('shows hero view when currentView is home', () => {
    const wrapper = mount(WidgetHeader, {
      props: defaultProps,
    })

    const heroContent = wrapper.find('.ci-widget-hero-content')
    expect(heroContent.exists()).toBe(true)
  })

  it('shows chat view when currentView is chat', () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        currentView: 'chat',
      },
    })

    const title = wrapper.find('.ci-widget-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toContain('Test Bot')
  })

  it('displays chat name in chat view', () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        currentView: 'chat',
      },
    })

    const title = wrapper.find('.ci-widget-title')
    expect(title.text()).toContain('Test Bot')
  })

  it('displays hero greeting when available', () => {
    const wrapper = mount(WidgetHeader, {
      props: defaultProps,
    })

    const greeting = wrapper.find('.ci-widget-hero__headline-gradient')
    expect(greeting.exists()).toBe(true)
  })

  it('displays display name in hero view', () => {
    const wrapper = mount(WidgetHeader, {
      props: defaultProps,
    })

    const greeting = wrapper.find('.ci-widget-hero__greeting-text')
    expect(greeting.text()).toContain('Hi User')
  })

  it('emits go-home event when back button clicked', async () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        currentView: 'chat',
      },
    })

    const backButton = wrapper.find('.ci-widget-btn-icon')
    await backButton.trigger('click')

    expect(wrapper.emitted('go-home')).toBeTruthy()
    expect(wrapper.emitted('go-home')).toHaveLength(1)
  })

  it('emits close event when close button clicked', async () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        currentView: 'chat',
      },
    })

    const closeButtons = wrapper.findAll('.ci-widget-btn-icon')
    const closeButton = closeButtons[closeButtons.length - 1] // Last button is close
    await closeButton.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('displays icon URL when available', () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        initData: {
          ...mockInitResponseNewChat,
          iconUrl: 'https://example.com/icon.png',
        },
      },
    })

    const icon = wrapper.find('img.ci-widget-hero__logo-img')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('src')).toBe('https://example.com/icon.png')
  })

  it('displays default icon when iconUrl not available', () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        initData: {
          ...mockInitResponseNewChat,
          iconUrl: undefined,
        },
      },
    })

    const icon = wrapper.find('.ci-widget-icon.ci-widget-hero__logo')
    expect(icon.exists()).toBe(true)
  })

  it('applies hero header class for home view', () => {
    const wrapper = mount(WidgetHeader, {
      props: defaultProps,
    })

    const header = wrapper.find('.ci-widget-panel__header')
    expect(header.classes()).toContain('ci-widget-panel__header--hero')
  })

  it('applies chat header class for chat view', () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        currentView: 'chat',
      },
    })

    const header = wrapper.find('.ci-widget-panel__header')
    expect(header.classes()).toContain('ci-widget-panel__header--chat')
  })

  it('applies widget color to chat header', () => {
    const wrapper = mount(WidgetHeader, {
      props: {
        ...defaultProps,
        currentView: 'chat',
      },
    })

    const header = wrapper.find('.ci-widget-panel__header')
    const style = header.attributes('style')
    expect(style).toContain('background-color: rgb(40, 102, 207)')
  })
})

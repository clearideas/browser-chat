import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WidgetHomeView from '@/components/WidgetHomeView.vue'

import { mockWidgetActions } from '../../fixtures/mock-data'

describe('WidgetHomeView', () => {
  it('renders actions list', () => {
    const wrapper = mount(WidgetHomeView, {
      props: {
        actions: mockWidgetActions,
        widgetColor: '#2866cf',
      },
    })

    const actions = wrapper.findAll('.ci-widget-action')
    expect(actions.length).toBe(mockWidgetActions.length)
  })

  it('displays action titles and descriptions', () => {
    const wrapper = mount(WidgetHomeView, {
      props: {
        actions: mockWidgetActions,
        widgetColor: '#2866cf',
      },
    })

    const firstAction = wrapper.find('.ci-widget-action')
    expect(firstAction.text()).toContain('Ask a question')
    expect(firstAction.text()).toContain('AI Assistant can help')
  })

  it('emits action event on click', async () => {
    const wrapper = mount(WidgetHomeView, {
      props: {
        actions: mockWidgetActions,
        widgetColor: '#2866cf',
      },
    })

    const firstAction = wrapper.find('.ci-widget-action')
    await firstAction.trigger('click')

    expect(wrapper.emitted('action')).toBeTruthy()
    expect(wrapper.emitted('action')).toHaveLength(1)
    expect(wrapper.emitted('action')![0][0]).toEqual(mockWidgetActions[0])
  })

  it('applies chat action styling', () => {
    const wrapper = mount(WidgetHomeView, {
      props: {
        actions: mockWidgetActions,
        widgetColor: '#2866cf',
      },
    })

    const chatAction = wrapper.find('.ci-widget-action--chat')
    expect(chatAction.exists()).toBe(true)
    const style = chatAction.attributes('style')
    expect(style).toContain('background-color')
  })

  it('renders icon for chat actions', () => {
    const wrapper = mount(WidgetHomeView, {
      props: {
        actions: mockWidgetActions,
        widgetColor: '#2866cf',
      },
    })

    const chatAction = wrapper.find('.ci-widget-action--chat')
    const icon = chatAction.find('.ci-widget-icon')
    expect(icon.exists()).toBe(true)
  })

  it('renders chevron for link actions', () => {
    const wrapper = mount(WidgetHomeView, {
      props: {
        actions: mockWidgetActions,
        widgetColor: '#2866cf',
      },
    })

    const linkActions = wrapper.findAll('.ci-widget-action').filter(action => {
      return !action.classes().includes('ci-widget-action--chat')
    })

    expect(linkActions.length).toBeGreaterThan(0)
    linkActions.forEach(action => {
      const icon = action.find('.ci-widget-icon')
      expect(icon.exists()).toBe(true)
    })
  })
})

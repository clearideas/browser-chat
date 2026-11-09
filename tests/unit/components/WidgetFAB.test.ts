import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WidgetFAB from '@/components/WidgetFAB.vue'

describe('WidgetFAB', () => {
  it('renders FAB button', () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: false,
        widgetColor: '#2866cf',
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    expect(button.exists()).toBe(true)
  })

  it('emits toggle event on click', async () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: false,
        widgetColor: '#2866cf',
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    await button.trigger('click')

    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('shows correct aria-label when closed', () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: false,
        widgetColor: '#2866cf',
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    expect(button.attributes('aria-label')).toBe('Open chat')
  })

  it('shows correct aria-label when open', () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: true,
        widgetColor: '#2866cf',
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    expect(button.attributes('aria-label')).toBe('Close chat')
  })

  it('applies widget color to background', () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: false,
        widgetColor: '#ff0000',
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    expect((button.element as HTMLButtonElement).style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('uses default fabSize of 56px', () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: false,
        widgetColor: '#2866cf',
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    const style = button.attributes('style')
    expect(style).toContain('width: 56px')
    expect(style).toContain('height: 56px')
  })

  it('uses custom fabSize when provided', () => {
    const wrapper = mount(WidgetFAB, {
      props: {
        isOpen: false,
        widgetColor: '#2866cf',
        fabSize: 64,
      },
    })

    const button = wrapper.find('button.ci-widget-fab')
    const style = button.attributes('style')
    expect(style).toContain('width: 64px')
    expect(style).toContain('height: 64px')
  })
})

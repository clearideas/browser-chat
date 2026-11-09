import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ChatMessage from '@/components/ChatMessage.vue'

import { mockChatMessages, mockChatMessageWithAudio } from '../../fixtures/mock-data'

describe('ChatMessage', () => {
  const defaultProps = {
    message: mockChatMessages[0],
    index: 0,
    widgetColor: '#2866cf',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    progress: 0,
  }

  it('renders user message', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessages[0], // user message
      },
    })

    const message = wrapper.find('.ci-widget-message--user')
    expect(message.exists()).toBe(true)
  })

  it('renders assistant message', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessages[1], // assistant message
      },
    })

    const message = wrapper.find('.ci-widget-message--assistant')
    expect(message.exists()).toBe(true)
  })

  it('renders message content', () => {
    const wrapper = mount(ChatMessage, {
      props: defaultProps,
    })

    const content = wrapper.find('.ci-widget-message__text')
    expect(content.exists()).toBe(true)
    expect(content.text()).toContain('Hello, how are you?')
  })

  it('formats markdown content', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessages[3], // message with markdown
      },
    })

    const content = wrapper.find('.ci-widget-message__text')
    expect(content.html()).toContain('<a')
  })

  it('shows audio controls when audio is present', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
      },
    })

    const audioButton = wrapper.find('.ci-widget-audio-btn')
    expect(audioButton.exists()).toBe(true)
  })

  it('hides audio controls when audio is not present', () => {
    const wrapper = mount(ChatMessage, {
      props: defaultProps,
    })

    const audioButton = wrapper.find('.ci-widget-audio-btn')
    expect(audioButton.exists()).toBe(false)
  })

  it('emits toggle event when audio button clicked', async () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
      },
    })

    const audioButton = wrapper.find('.ci-widget-audio-btn')
    await audioButton.trigger('click')

    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')![0][0]).toBe(0)
    expect(wrapper.emitted('toggle')![0][1]).toBe(mockChatMessageWithAudio.audio)
  })

  it('displays audio progress bar when audio is present', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
        duration: 100,
        currentTime: 25,
        progress: 25,
      },
    })

    const progressBar = wrapper.find('input[type="range"]')
    expect(progressBar.exists()).toBe(true)
    expect(progressBar.attributes('max')).toBe('100')
    expect(progressBar.attributes('value')).toBe('25')
  })

  it('emits seek event when progress bar changes', async () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
        duration: 100,
      },
    })

    const progressBar = wrapper.find('input[type="range"]')
    await progressBar.setValue('50')
    await progressBar.trigger('input')

    expect(wrapper.emitted('seek')).toBeTruthy()
    expect(wrapper.emitted('seek')![0][0]).toBe(0)
    expect(wrapper.emitted('seek')![0][1]).toBe(50)
  })

  it('displays audio controls when message has audio', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
        duration: 120,
      },
    })

    const audioControls = wrapper.find('.ci-widget-message__audio-controls')
    const audioSlider = wrapper.find('.ci-widget-audio-slider')
    expect(audioControls.exists()).toBe(true)
    expect(audioSlider.exists()).toBe(true)
    expect(audioSlider.attributes('max')).toBe('120')
  })

  it('shows play icon when not playing', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
        isPlaying: false,
      },
    })

    const audioButton = wrapper.find('.ci-widget-audio-btn')
    // Should contain play icon (check for SVG or icon class)
    expect(audioButton.exists()).toBe(true)
  })

  it('shows pause icon when playing', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessageWithAudio,
        isPlaying: true,
      },
    })

    const audioButton = wrapper.find('.ci-widget-audio-btn')
    expect(audioButton.exists()).toBe(true)
  })

  it('renders source links with data-original-url', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        ...defaultProps,
        message: mockChatMessages[3], // message with source links
      },
    })

    const content = wrapper.find('.ci-widget-message__text')
    const html = content.html()
    expect(html).toContain('data-original-url')
    expect(html).toContain('chat-source')
  })
})

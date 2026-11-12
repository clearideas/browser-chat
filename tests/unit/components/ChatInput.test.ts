import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ChatInput from '@/components/ChatInput.vue'

describe('ChatInput', () => {
  const defaultProps = {
    modelValue: '',
    disabled: false,
    loading: false,
    isRecording: false,
    recordingDuration: 0,
    waveformData: [],
    voiceEnabled: false,
    supportsVoiceRecording: false,
    expanded: false,
  }

  it('renders textarea when not recording', () => {
    const wrapper = mount(ChatInput, {
      props: defaultProps,
    })

    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
  })

  it('renders waveform when recording', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        isRecording: true,
        waveformData: Array(25).fill(0.5),
      },
    })

    const waveform = wrapper.find('.consumer-input__waveform')
    expect(waveform.exists()).toBe(true)
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(ChatInput, {
      props: defaultProps,
    })

    const textarea = wrapper.find('textarea')
    await textarea.setValue('Hello world')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('Hello world')
  })

  it('emits send event on Enter key', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        modelValue: 'Test message',
      },
    })

    const textarea = wrapper.find('textarea')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })

    expect(wrapper.emitted('send')).toBeTruthy()
  })

  it('does not emit send on Shift+Enter', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        modelValue: 'Test message',
      },
    })

    const textarea = wrapper.find('textarea')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('emits send event on send button click', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        modelValue: 'Test message',
      },
    })

    const sendButton = wrapper.find('.consumer-input__send')
    await sendButton.trigger('click')

    expect(wrapper.emitted('send')).toBeTruthy()
  })

  it('keeps the text box usable while a reply loads, with a stop button instead of send', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        modelValue: 'next question',
        loading: true,
      },
    })

    // Disabling a focused text box would drop keyboard focus to the page.
    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[aria-label="Send message"]').exists()).toBe(false)
    const stop = wrapper.find('.consumer-input__stop')
    expect(stop.attributes('aria-label')).toBe('Stop reply')
    await stop.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('disables input when disabled prop is true', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        disabled: true,
      },
    })

    const textarea = wrapper.find('textarea')
    expect(textarea.attributes('disabled')).toBeDefined()
  })

  it('shows voice button when voice is enabled', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        voiceEnabled: true,
        supportsVoiceRecording: true,
      },
    })

    const voiceButton = wrapper.find('.consumer-input__voice-btn')
    expect(voiceButton.exists()).toBe(true)
  })

  it('hides voice button when voice is disabled', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        voiceEnabled: false,
      },
    })

    const voiceButton = wrapper.find('.consumer-input__voice-btn')
    expect(voiceButton.exists()).toBe(false)
  })

  it('emits start-recording when voice button clicked', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        voiceEnabled: true,
        supportsVoiceRecording: true,
      },
    })

    const voiceButton = wrapper.find('.consumer-input__voice-btn')
    await voiceButton.trigger('click')

    expect(wrapper.emitted('start-recording')).toBeTruthy()
  })

  it('shows recording controls when recording', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        isRecording: true,
        recordingDuration: 5,
      },
    })

    const cancelButton = wrapper.find('.consumer-input__cancel-btn')
    const acceptButton = wrapper.find('.consumer-input__accept-btn')
    expect(cancelButton.exists()).toBe(true)
    expect(acceptButton.exists()).toBe(true)
  })

  it('emits cancel-recording when cancel button clicked', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        isRecording: true,
      },
    })

    const cancelButton = wrapper.find('.consumer-input__cancel-btn')
    await cancelButton.trigger('click')

    expect(wrapper.emitted('cancel-recording')).toBeTruthy()
  })

  it('emits stop-recording when accept button clicked', async () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        isRecording: true,
      },
    })

    const acceptButton = wrapper.find('.consumer-input__accept-btn')
    await acceptButton.trigger('click')

    expect(wrapper.emitted('stop-recording')).toBeTruthy()
  })

  it('displays recording duration', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        isRecording: true,
        recordingDuration: 45,
      },
    })

    const duration = wrapper.find('.waveform-duration')
    expect(duration.exists()).toBe(true)
    expect(duration.text()).toContain('00:45')
  })

  it('expands textarea when expanded prop is true', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        expanded: true,
      },
    })

    const textarea = wrapper.find('textarea')
    expect(textarea.attributes('rows')).toBe('3')
  })

  it('uses single row when not expanded', () => {
    const wrapper = mount(ChatInput, {
      props: {
        ...defaultProps,
        expanded: false,
      },
    })

    const textarea = wrapper.find('textarea')
    expect(textarea.attributes('rows')).toBe('1')
  })

  it('emits focus and blur events', async () => {
    const wrapper = mount(ChatInput, {
      props: defaultProps,
    })

    const textarea = wrapper.find('textarea')
    await textarea.trigger('focus')
    expect(wrapper.emitted('focus')).toBeTruthy()

    await textarea.trigger('blur')
    expect(wrapper.emitted('blur')).toBeTruthy()
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RealtimeVoiceView from '@/components/RealtimeVoiceView.vue'

describe('RealtimeVoiceView', () => {
  it('shows an explicit live conversation and emits its call controls', async () => {
    const wrapper = mount(RealtimeVoiceView, {
      props: {
        connectionState: 'connected',
        isResponding: false,
        isMuted: false,
        duration: 12,
        waveformData: [0.1, 0.4, 0.8],
        widgetColor: '#375dfb',
        caption: 'How can I help today?',
      },
    })

    expect(wrapper.text()).toContain('Live')
    expect(wrapper.text()).toContain('Listening')
    expect(wrapper.text()).toContain('How can I help today?')
    expect(wrapper.get('[aria-label="Live transcript"]').attributes('tabindex')).toBe('0')

    await wrapper.get('[aria-label="Mute"]').trigger('click')
    await wrapper.get('[aria-label="End"]').trigger('click')
    expect(wrapper.emitted('toggleMute')).toHaveLength(1)
    expect(wrapper.emitted('end')).toHaveLength(1)
  })

  it('renders long transcripts in the scrollable transcript region', () => {
    const caption = Array(12).fill('A complete response remains available.').join(' ')
    const wrapper = mount(RealtimeVoiceView, {
      props: {
        connectionState: 'connected',
        isResponding: true,
        isMuted: false,
        duration: 8,
        waveformData: [0.2, 0.6],
        widgetColor: '#ed613f',
        caption,
      },
    })

    const transcript = wrapper.get('[aria-label="Live transcript"]')
    expect(transcript.text()).toBe(caption)
    expect(transcript.classes()).toContain('realtime-voice__caption')
  })

  it('distinguishes the assistant speaking state', () => {
    const wrapper = mount(RealtimeVoiceView, {
      props: {
        connectionState: 'connected',
        isResponding: true,
        isMuted: false,
        duration: 3,
        waveformData: [],
        widgetColor: '#375dfb',
      },
    })

    expect(wrapper.text()).toContain('Speaking')
    expect(wrapper.text()).toContain('interrupt')
  })

  it('hides the speaking prompt after the user has spoken', () => {
    const wrapper = mount(RealtimeVoiceView, {
      props: {
        connectionState: 'connected',
        isResponding: false,
        isMuted: false,
        duration: 3,
        waveformData: [],
        widgetColor: '#375dfb',
        hasUserSpoken: true,
      },
    })

    expect(wrapper.text()).toContain('Listening')
    expect(wrapper.text()).not.toContain('Just start speaking')
  })

  it('offers an explicit recorded fallback after a live connection failure', async () => {
    const wrapper = mount(RealtimeVoiceView, {
      props: {
        connectionState: 'failed',
        isResponding: false,
        isMuted: false,
        duration: 0,
        waveformData: [],
        widgetColor: '#375dfb',
      },
    })

    await wrapper.get('button.realtime-voice__fallback').trigger('click')
    expect(wrapper.text()).toContain('Could not connect')
    expect(wrapper.emitted('useRecorded')).toHaveLength(1)
  })

  it('shows why the call failed, and offers no recording when the microphone is the problem', () => {
    const wrapper = mount(RealtimeVoiceView, {
      props: {
        connectionState: 'failed',
        isResponding: false,
        isMuted: false,
        duration: 0,
        waveformData: [],
        widgetColor: '#375dfb',
        error: 'Microphone access was denied.',
        canUseRecorded: false,
      },
    })
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toBe('Microphone access was denied.')
    expect(wrapper.find('button.realtime-voice__fallback').exists()).toBe(false)
  })
})

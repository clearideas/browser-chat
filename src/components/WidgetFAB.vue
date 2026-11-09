<script setup lang="ts">
import { computed } from 'vue'

import { useWidgetI18n } from '../i18n/runtime'
import { icons } from '../icons'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    widgetColor: string
    fabSize?: number
  }>(),
  {
    fabSize: 56,
  },
)

const emit = defineEmits<{
  toggle: []
  'fab-btn-ref': [element: HTMLElement | null]
}>()
const { t } = useWidgetI18n()

// Calculate icon size based on FAB size
// Default: 56px button -> 28px icon (closed), 22px icon (open)
// Scale proportionally
const iconSize = computed(() => {
  const scale = props.fabSize / 56
  return props.isOpen ? Math.round(22 * scale) : Math.round(28 * scale)
})

// Helper function to wrap icon path in SVG tag
function getIconSVG(iconName: keyof typeof icons, size: number = 16): string {
  const iconPath = icons[iconName]
  if (!iconPath) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="${size}" height="${size}" fill="currentColor">${iconPath}</svg>`
}

const fabStyle = computed(() => ({
  backgroundColor: props.widgetColor,
  width: `${props.fabSize}px`,
  height: `${props.fabSize}px`,
}))
</script>

<template>
  <button
    :ref="el => emit('fab-btn-ref', el as HTMLElement | null)"
    class="ci-widget-fab"
    :aria-label="props.isOpen ? t('fab.closeChat') : t('fab.openChat')"
    :style="fabStyle"
    @click="emit('toggle')"
  >
    <span
      class="ci-widget-icon ci-widget-fab-icon"
      v-html="getIconSVG(props.isOpen ? 'xmark' : 'commentDots', iconSize)"
    ></span>
  </button>
</template>

<style scoped>
.ci-widget-fab {
  position: absolute;
  top: 0;
  right: 0;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
}

.ci-widget-fab:hover {
  transform: scale(1.05) translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.ci-widget-fab:active {
  transform: scale(0.98) translateY(0px);
}

.ci-widget-fab .ci-widget-fab-icon {
  width: auto;
  height: auto;
  color: white;
}

.ci-widget-fab .ci-widget-fab-icon svg {
  fill: currentColor;
}

.ci-widget-fab .ci-widget-fab-icon svg path {
  fill: currentColor;
}

.ci-widget-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.ci-widget-icon svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.ci-widget-icon svg path {
  fill: currentColor;
}

@media print {
  .ci-widget-fab {
    display: none !important;
  }
}
</style>

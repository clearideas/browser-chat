<script setup lang="ts">
import { computed } from 'vue'

import { useWidgetI18n } from '../i18n/runtime'
import { getIconSVG } from '../icons'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    widgetColor: string
    fabSize?: number
    /** Side of the button the tooltip appears on (away from the screen edge). */
    tooltipPlacement?: 'left' | 'right'
    /** Whether the panel this button opens is open, and its element id (for screen readers). */
    expanded?: boolean
    controls?: string
  }>(),
  {
    fabSize: 56,
    tooltipPlacement: 'left',
  },
)

const emit = defineEmits<{
  toggle: []
}>()
const { t } = useWidgetI18n()

// Calculate icon size based on FAB size
// Default: 56px button -> 28px icon (closed), 22px icon (open)
// Scale proportionally
const iconSize = computed(() => {
  const scale = props.fabSize / 56
  return props.isOpen ? Math.round(22 * scale) : Math.round(28 * scale)
})

const fabStyle = computed(() => ({
  backgroundColor: props.widgetColor,
  width: `${props.fabSize}px`,
  height: `${props.fabSize}px`,
}))
</script>

<template>
  <button
    type="button"
    class="ci-widget-fab"
    :aria-label="props.isOpen ? t('fab.closeChat') : t('fab.openChat')"
    :aria-expanded="props.expanded ? 'true' : 'false'"
    :aria-controls="props.expanded ? props.controls : undefined"
    :data-tooltip="props.isOpen ? t('fab.closeChat') : t('fab.openChat')"
    :data-tooltip-placement="props.tooltipPlacement"
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
  color: var(--ci-widget-on-accent);
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
  color: var(--ci-widget-on-accent);
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

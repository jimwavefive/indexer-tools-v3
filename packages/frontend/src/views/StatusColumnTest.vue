<template>
  <div class="status-test-page">
    <h2>Status Column Visual Options</h2>
    <p class="hint">
      Each section below shows the same 5 deployment states rendered differently.
      Pick the style you prefer and I'll apply it to both tables.
    </p>

    <!-- Option A: Current 2-dot style -->
    <section class="option-section">
      <h3>Option A: Two Dots + Label (current)</h3>
      <p class="option-desc">Dot 1 = Synced, Dot 2 = Deterministic. Compact but requires tooltip knowledge.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'a-'+s.label">
            <td>
              <span class="health-cell">
                <span :class="['health-dot', s.syncedDot]" :title="'Synced: ' + s.syncedLabel"></span>
                <span :class="['health-dot', s.detDot]" :title="'Deterministic: ' + s.detLabel"></span>
                {{ s.statusLabel }}
              </span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option B: Colored pill/badge -->
    <section class="option-section">
      <h3>Option B: Colored Pill Badge</h3>
      <p class="option-desc">Single colored badge with the status text. Clean and immediately readable.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'b-'+s.label">
            <td>
              <span :class="['status-pill', 'pill-' + s.pillColor]">{{ s.statusLabel }}</span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option C: Icon + Label -->
    <section class="option-section">
      <h3>Option C: Icon + Label</h3>
      <p class="option-desc">PrimeIcons icon with colored text. More expressive than dots.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'c-'+s.label">
            <td>
              <span :class="['status-icon-cell', 'icon-' + s.pillColor]">
                <i :class="s.icon"></i>
                {{ s.statusLabel }}
              </span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option D: Colored left-border bar -->
    <section class="option-section">
      <h3>Option D: Left Border Bar + Label</h3>
      <p class="option-desc">Colored left stripe like a severity indicator. Subtle but clear.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'d-'+s.label">
            <td>
              <span :class="['status-bar', 'bar-' + s.pillColor]">{{ s.statusLabel }}</span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option E: Single dot + label (simplified) -->
    <section class="option-section">
      <h3>Option E: Single Dot + Label</h3>
      <p class="option-desc">One colored dot summarising overall status. Simpler than two dots.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'e-'+s.label">
            <td>
              <span class="health-cell">
                <span :class="['single-dot', 'dot-' + s.pillColor]"></span>
                {{ s.statusLabel }}
              </span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option F: Dot + deterministic sub-indicator -->
    <section class="option-section">
      <h3>Option F: Dot + Subscript Indicator</h3>
      <p class="option-desc">Single dot for sync status, with a tiny "DET" or "NONDET" tag for failures.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'f-'+s.label">
            <td>
              <span class="health-cell">
                <span :class="['single-dot', 'dot-' + s.pillColor]"></span>
                <span>{{ s.shortLabel }}</span>
                <span v-if="s.subTag" :class="['sub-tag', 'tag-' + s.subTagColor]">{{ s.subTag }}</span>
              </span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
const states = [
  {
    label: 'synced',
    statusLabel: 'Synced',
    shortLabel: 'Synced',
    meaning: 'Healthy and fully synced to chain head',
    syncedDot: 'health-green',
    syncedLabel: 'Yes',
    detDot: 'health-default',
    detLabel: 'N/A',
    pillColor: 'green',
    icon: 'pi pi-check-circle',
    subTag: null as string | null,
    subTagColor: '',
  },
  {
    label: 'syncing',
    statusLabel: 'Syncing',
    shortLabel: 'Syncing',
    meaning: 'Healthy but still catching up to chain head',
    syncedDot: 'health-red',
    syncedLabel: 'No',
    detDot: 'health-default',
    detLabel: 'N/A',
    pillColor: 'blue',
    icon: 'pi pi-sync',
    subTag: null,
    subTagColor: '',
  },
  {
    label: 'failed-nondet',
    statusLabel: 'Failed NONDET',
    shortLabel: 'Failed',
    meaning: 'Non-deterministic failure (may self-recover, can rewind)',
    syncedDot: 'health-red',
    syncedLabel: 'No',
    detDot: 'health-yellow',
    detLabel: 'Non-deterministic',
    pillColor: 'yellow',
    icon: 'pi pi-exclamation-triangle',
    subTag: 'NONDET',
    subTagColor: 'yellow',
  },
  {
    label: 'failed-det',
    statusLabel: 'Failed DET',
    shortLabel: 'Failed',
    meaning: 'Deterministic failure (permanent, requires new deployment version)',
    syncedDot: 'health-red',
    syncedLabel: 'No',
    detDot: 'health-red',
    detLabel: 'Deterministic',
    pillColor: 'red',
    icon: 'pi pi-times-circle',
    subTag: 'DET',
    subTagColor: 'red',
  },
  {
    label: 'unknown',
    statusLabel: 'Unknown',
    shortLabel: 'Unknown',
    meaning: 'No status data available from graph-node',
    syncedDot: 'health-default',
    syncedLabel: 'Unknown',
    detDot: 'health-default',
    detLabel: 'Unknown',
    pillColor: 'grey',
    icon: 'pi pi-question-circle',
    subTag: null,
    subTagColor: '',
  },
];
</script>

<style scoped>
.status-test-page {
  padding: 1.5rem;
  max-width: 900px;
}

h2 { margin: 0 0 0.5rem; }
h3 { margin: 1.5rem 0 0.25rem; font-size: 1rem; }

.hint {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}

.option-desc {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}

.option-section {
  border: 1px solid var(--app-surface-border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: var(--app-surface-elevated);
}

.demo-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.demo-table th {
  text-align: left;
  padding: 0.4rem 0.75rem;
  border-bottom: 2px solid var(--app-surface-border-strong);
  font-weight: 600;
}

.demo-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--app-surface-border);
  vertical-align: middle;
}

.meaning {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}

/* === Option A: Two Dots (current) === */
.health-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.health-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.health-green { background: #4caf50; }
.health-blue { background: #2196f3; }
.health-red { background: #f44336; }
.health-yellow { background: #ff9800; }
.health-default { background: #9e9e9e; }

/* === Option B: Pill Badge === */
.status-pill {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.pill-green { background: rgba(76, 175, 80, 0.15); color: #4caf50; }
.pill-blue { background: rgba(33, 150, 243, 0.15); color: #2196f3; }
.pill-yellow { background: rgba(255, 152, 0, 0.15); color: #ff9800; }
.pill-red { background: rgba(244, 67, 54, 0.15); color: #f44336; }
.pill-grey { background: rgba(158, 158, 158, 0.15); color: #9e9e9e; }

/* === Option C: Icon + Label === */
.status-icon-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.status-icon-cell i { font-size: 0.9rem; }

.icon-green { color: #4caf50; }
.icon-blue { color: #2196f3; }
.icon-yellow { color: #ff9800; }
.icon-red { color: #f44336; }
.icon-grey { color: #9e9e9e; }

/* === Option D: Left Border Bar === */
.status-bar {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-left: 3px solid;
  font-size: 0.8rem;
  font-weight: 500;
}

.bar-green { border-color: #4caf50; color: #4caf50; }
.bar-blue { border-color: #2196f3; color: #2196f3; }
.bar-yellow { border-color: #ff9800; color: #ff9800; }
.bar-red { border-color: #f44336; color: #f44336; }
.bar-grey { border-color: #9e9e9e; color: #9e9e9e; }

/* === Option E: Single Dot === */
.single-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-green { background: #4caf50; }
.dot-blue { background: #2196f3; }
.dot-yellow { background: #ff9800; }
.dot-red { background: #f44336; }
.dot-grey { background: #9e9e9e; }

/* === Option F: Dot + Sub-tag === */
.sub-tag {
  display: inline-block;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  vertical-align: middle;
}

.tag-yellow { background: rgba(255, 152, 0, 0.15); color: #ff9800; }
.tag-red { background: rgba(244, 67, 54, 0.15); color: #f44336; }
</style>

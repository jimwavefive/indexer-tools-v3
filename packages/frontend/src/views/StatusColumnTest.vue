<template>
  <div class="status-test-page">
    <h2>Status Column — Icon + Label Variations</h2>
    <p class="hint">
      All options use Icon + Label style. Hover over any status to see the tooltip with its meaning.
      Syncing shows an integer percentage. No status data = no icon (just a dash).
    </p>

    <!-- Option A: Icon + Label (inline percentage) -->
    <section class="option-section">
      <h3>Option A: Icon + Label (inline percentage)</h3>
      <p class="option-desc">Percentage shown inline after "Syncing". Clean, compact single line.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning (shown in tooltip)</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'a-'+s.label">
            <td>
              <span v-if="s.icon" :class="['status-icon-cell', 'icon-' + s.color]" :title="s.meaning">
                <i :class="s.icon"></i>
                {{ s.displayA }}
              </span>
              <span v-else class="no-status">&mdash;</span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option B: Icon + Label (percentage in muted sub-text) -->
    <section class="option-section">
      <h3>Option B: Icon + Label (percentage as sub-text)</h3>
      <p class="option-desc">Percentage shown in smaller muted text. Keeps the label clean while showing progress.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning (shown in tooltip)</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'b-'+s.label">
            <td>
              <span v-if="s.icon" :class="['status-icon-cell', 'icon-' + s.color]" :title="s.meaning">
                <i :class="s.icon"></i>
                <span>{{ s.displayLabel }}</span>
                <span v-if="s.pctText" class="pct-sub">{{ s.pctText }}</span>
              </span>
              <span v-else class="no-status">&mdash;</span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option C: Icon + Label with mini progress bar -->
    <section class="option-section">
      <h3>Option C: Icon + Label + Progress Bar</h3>
      <p class="option-desc">Syncing states get a tiny inline progress bar. More visual, slightly wider column.</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning (shown in tooltip)</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'c-'+s.label">
            <td>
              <template v-if="s.icon">
                <span :class="['status-icon-cell', 'icon-' + s.color]" :title="s.meaning">
                  <i :class="s.icon"></i>
                  <span>{{ s.displayLabel }}</span>
                </span>
                <span v-if="s.pct !== null" class="progress-wrap" :title="s.meaning">
                  <span class="progress-track">
                    <span class="progress-fill" :style="{ width: s.pct + '%' }"></span>
                  </span>
                  <span class="pct-label">{{ s.pct }}%</span>
                </span>
              </template>
              <span v-else class="no-status">&mdash;</span>
            </td>
            <td class="meaning">{{ s.meaning }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Option D: Icon + Label with failure sub-tag -->
    <section class="option-section">
      <h3>Option D: Icon + Label + Failure Tag</h3>
      <p class="option-desc">Failed states get a small DET/NONDET tag. Syncing shows inline percentage. Non-failure shows "Healthy".</p>
      <table class="demo-table">
        <thead><tr><th>Status</th><th>Meaning (shown in tooltip)</th></tr></thead>
        <tbody>
          <tr v-for="s in states" :key="'d-'+s.label">
            <td>
              <span v-if="s.icon" :class="['status-icon-cell', 'icon-' + s.color]" :title="s.meaning">
                <i :class="s.icon"></i>
                <span>{{ s.displayD }}</span>
                <span v-if="s.subTag" :class="['sub-tag', 'tag-' + s.color]">{{ s.subTag }}</span>
              </span>
              <span v-else class="no-status">&mdash;</span>
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
    displayLabel: 'Synced',
    displayA: 'Synced',
    displayD: 'Synced',
    meaning: 'Healthy and fully synced to chain head',
    color: 'green',
    icon: 'pi pi-check-circle',
    pct: null as number | null,
    pctText: null as string | null,
    subTag: null as string | null,
  },
  {
    label: 'syncing',
    displayLabel: 'Syncing',
    displayA: 'Syncing 78%',
    displayD: 'Syncing 78%',
    meaning: 'Healthy but still catching up to chain head (78% synced)',
    color: 'blue',
    icon: 'pi pi-sync',
    pct: 78,
    pctText: '78%',
    subTag: null,
  },
  {
    label: 'syncing-early',
    displayLabel: 'Syncing',
    displayA: 'Syncing 12%',
    displayD: 'Syncing 12%',
    meaning: 'Healthy but still catching up to chain head (12% synced)',
    color: 'blue',
    icon: 'pi pi-sync',
    pct: 12,
    pctText: '12%',
    subTag: null,
  },
  {
    label: 'failed-nondet',
    displayLabel: 'Failed NONDET',
    displayA: 'Failed NONDET',
    displayD: 'Failed',
    meaning: 'Non-deterministic failure (may self-recover, can rewind)',
    color: 'yellow',
    icon: 'pi pi-exclamation-triangle',
    pct: null,
    pctText: null,
    subTag: 'NONDET',
  },
  {
    label: 'failed-det',
    displayLabel: 'Failed DET',
    displayA: 'Failed DET',
    displayD: 'Failed',
    meaning: 'Deterministic failure (permanent, requires new deployment version)',
    color: 'red',
    icon: 'pi pi-times-circle',
    pct: null,
    pctText: null,
    subTag: 'DET',
  },
  {
    label: 'no-data',
    displayLabel: '',
    displayA: '',
    displayD: '',
    meaning: 'No status data from graph-node — no icon shown',
    color: 'none',
    icon: '',
    pct: null,
    pctText: null,
    subTag: null,
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

/* === Icon + Label base === */
.status-icon-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: default;
}

.status-icon-cell i { font-size: 0.9rem; }

.icon-green { color: #4caf50; }
.icon-blue { color: #2196f3; }
.icon-yellow { color: #ff9800; }
.icon-red { color: #f44336; }

/* === Option B: Muted percentage sub-text === */
.pct-sub {
  font-size: 0.75rem;
  font-weight: 400;
  opacity: 0.65;
  margin-left: 0.1rem;
}

/* === Option C: Mini progress bar === */
.progress-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.4rem;
}

.progress-track {
  display: inline-block;
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: #2196f3;
  transition: width 0.3s ease;
}

.pct-label {
  font-size: 0.7rem;
  color: #2196f3;
  font-weight: 600;
}

/* === Option D: Failure sub-tag === */
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

/* === No status data === */
.no-status {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}
</style>

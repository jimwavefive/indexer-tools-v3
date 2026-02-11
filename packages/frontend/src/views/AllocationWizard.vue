<template>
  <div class="allocation-wizard">
    <Stepper :value="currentStep" @update:value="currentStep = $event">
      <StepList>
        <Step :value="1">Close Allocations</Step>
        <Step :value="2">Custom POIs</Step>
        <Step :value="3">Pick Subgraphs</Step>
        <Step :value="4">Set Allocations</Step>
        <Step :value="5">Execute</Step>
      </StepList>
      <StepPanels>
        <StepPanel :value="1">
          <StepCloseAllocations
            :data="allocEnriched"
            :loading="allocLoading"
            :table-height="tableHeight"
            :totals="allocTotals"
            @update:selected="wizardStore.closingAllocationIds = $event"
          />
        </StepPanel>
        <StepPanel :value="2">
          <StepCustomPOIs
            :closing-allocations="closingAllocations"
            :custom-p-o-is="wizardStore.customPOIs"
            :custom-block-heights="wizardStore.customBlockHeights"
            :custom-public-p-o-is="wizardStore.customPublicPOIs"
          />
        </StepPanel>
        <StepPanel :value="3">
          <StepPickSubgraphs
            :data="subFiltered"
            :loading="subLoading"
            :table-height="tableHeight"
            @update:selected="onSubgraphsSelected"
          />
        </StepPanel>
        <StepPanel :value="4">
          <StepSetAllocations
            :subgraphs="wizardSubgraphs"
            :new-allocations="wizardStore.newAllocations"
            :available-stake-grt="availableStakeGrt"
            :min-allocation="wizardStore.minAllocation"
            :min-allocation0-signal="wizardStore.minAllocation0Signal"
            @update:allocation="onAllocationUpdate"
            @update:min-allocation="wizardStore.minAllocation = $event"
            @update:min-allocation0-signal="wizardStore.minAllocation0Signal = $event"
            @set-max-allos="handleSetMaxAllos"
            @reset-allos="wizardStore.resetAllos()"
          />
        </StepPanel>
        <StepPanel :value="5">
          <StepExecute
            :actions-queue-commands="actionsQueueCommands"
            :indexing-rule-commands="indexingRuleCommands"
            :action-inputs="actionInputs"
          />
        </StepPanel>
      </StepPanels>
    </Stepper>

    <!-- Footer bar -->
    <div class="wizard-footer">
      <div class="footer-card">
        <span class="footer-label">Before APR</span>
        <span class="footer-value">{{ formatApr(allocTotals.avgApr) }}</span>
      </div>
      <div class="footer-card">
        <span class="footer-label">Closing APR</span>
        <span class="footer-value">{{ formatApr(closingAvgApr) }}</span>
      </div>
      <div class="footer-card">
        <span class="footer-label">Available Stake</span>
        <span class="footer-value" :class="{ 'negative': availableStakeGrt < 0 }">
          {{ Math.floor(availableStakeGrt).toLocaleString() }} GRT
        </span>
      </div>
      <div class="footer-card">
        <span class="footer-label">Opening APR</span>
        <span class="footer-value">{{ formatApr(openingAvgApr) }}</span>
      </div>
      <div class="footer-card">
        <span class="footer-label">After APR</span>
        <span class="footer-value">{{ formatApr(afterAvgApr) }}</span>
      </div>
      <div class="footer-card">
        <span class="footer-label">Selected Max Allos</span>
        <span class="footer-value">{{ Math.floor(selectedMaxAllos).toLocaleString() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Stepper from 'primevue/stepper';
import StepList from 'primevue/steplist';
import Step from 'primevue/step';
import StepPanels from 'primevue/steppanels';
import StepPanel from 'primevue/steppanel';
import {
  formatApr,
  weiToNumber,
  toWei,
  calculateNewApr,
  calculateSubgraphDailyRewards,
  maxAllo,
} from '@indexer-tools/shared';
import type { NetworkState } from '@indexer-tools/shared';
import StepCloseAllocations from '../components/wizard/StepCloseAllocations.vue';
import StepCustomPOIs from '../components/wizard/StepCustomPOIs.vue';
import StepPickSubgraphs from '../components/wizard/StepPickSubgraphs.vue';
import StepSetAllocations from '../components/wizard/StepSetAllocations.vue';
import type { WizardSubgraphRow } from '../components/wizard/StepSetAllocations.vue';
import StepExecute from '../components/wizard/StepExecute.vue';
import type { ActionInput } from '../composables/queries/useAgentActions';
import { useAllocations } from '../composables/queries/useAllocations';
import { useSubgraphs } from '../composables/queries/useSubgraphs';
import { useNetwork } from '../composables/queries/useNetwork';
import { useAccount } from '../composables/queries/useAccount';
import { useWizardStore } from '../composables/state/useWizard';
import { useChainStore } from '../composables/state/useChain';

const currentStep = ref(1);

const chainStore = useChainStore();
const wizardStore = useWizardStore();

// Query composables
const {
  enriched: allocEnriched,
  totals: allocTotals,
  isLoading: allocLoading,
  availableNetworks: indexerChains,
} = useAllocations();

const {
  filtered: subFiltered,
  isLoading: subLoading,
} = useSubgraphs(indexerChains);

const { data: networkData } = useNetwork();
const { data: accountData } = useAccount();

const tableHeight = computed(() => Math.max(window.innerHeight - 320, 400));

// ---------- Closing allocations (Step 1 → 2) ----------

const closingAllocations = computed(() => {
  const ids = new Set(wizardStore.closingAllocationIds);
  return allocEnriched.value.filter((a) => ids.has(a.id));
});

const closingStake = computed(() => {
  let sum = 0n;
  for (const allo of closingAllocations.value) {
    sum += allo.allocatedTokens;
  }
  return sum;
});

const closingRewardsPerYear = computed(() => {
  const network = networkData.value;
  if (!network) return 0;
  const totalSignalNum = weiToNumber(network.totalTokensSignalled);
  const issuancePerYearNum = weiToNumber(network.issuancePerYear);
  let sum = 0;
  for (const allo of closingAllocations.value) {
    if (!allo.deniedAt && allo.signalledTokens > 0n && allo.stakedTokens > 0n) {
      const signalNum = weiToNumber(allo.signalledTokens);
      const allocatedNum = weiToNumber(allo.allocatedTokens);
      const stakedNum = weiToNumber(allo.stakedTokens);
      sum += (signalNum / totalSignalNum) * issuancePerYearNum * (allocatedNum / stakedNum);
    }
  }
  return sum;
});

const closingAvgApr = computed(() => {
  const stake = weiToNumber(closingStake.value);
  return stake > 0 ? (closingRewardsPerYear.value / stake) * 100 : 0;
});

// ---------- Subgraph selection (Step 3 → 4) ----------

function onSubgraphsSelected(hashes: string[]) {
  wizardStore.selectedSubgraphHashes = hashes;
  // Initialize default allocations for new selections
  const subs = subFiltered.value
    .filter((s) => hashes.includes(s.ipfsHash))
    .map((s) => ({
      ipfsHash: s.ipfsHash,
      signalled: s.signalledTokens,
      denied: !!s.deniedAt,
    }));
  wizardStore.initDefaults(subs);
}

// Build closing allocation lookup (ipfsHash -> allocatedTokens)
const closingAlloByHash = computed(() => {
  const map = new Map<string, bigint>();
  for (const allo of closingAllocations.value) {
    map.set(allo.ipfsHash, allo.allocatedTokens);
  }
  return map;
});

// Enriched subgraphs for Step 4 with wizard-specific APR calculations
const wizardSubgraphs = computed<WizardSubgraphRow[]>(() => {
  const network = networkData.value;
  const hashes = new Set(wizardStore.selectedSubgraphHashes);
  const selected = subFiltered.value.filter((s) => hashes.has(s.ipfsHash));
  if (!network || selected.length === 0) return [];

  const networkData2 = {
    totalTokensSignalled: network.totalTokensSignalled,
    issuancePerYear: network.issuancePerYear,
    issuancePerBlock: network.issuancePerBlock,
  };
  const rewardCut = accountData.value?.rewardCut ?? 0;
  const targetApr = 10; // default target for maxAllo

  return selected.map((sub) => {
    const newAlloGrt = wizardStore.newAllocations[sub.ipfsHash] ?? 0;
    const newAlloWei = toWei(String(newAlloGrt));

    // Future staked = current staked - closing allocation (if same deployment is being closed)
    const closingAlloTokens = closingAlloByHash.value.get(sub.ipfsHash) ?? 0n;
    const futureStaked = sub.stakedTokens - closingAlloTokens;

    // Wizard APR (accounting for closing + new allocation)
    const wizardApr =
      sub.signalledTokens > 0n && futureStaked + newAlloWei > 0n
        ? calculateNewApr(sub.signalledTokens, futureStaked, networkData2, newAlloWei)
        : 0;

    // Daily rewards for the new allocation
    const wizardDailyRewards =
      sub.signalledTokens > 0n && futureStaked + newAlloWei > 0n
        ? calculateSubgraphDailyRewards(sub.signalledTokens, futureStaked, networkData2, newAlloWei)
        : 0;

    const wizardDailyRewardsCut =
      rewardCut > 0 ? Math.round(wizardDailyRewards * rewardCut / 1000000) : 0;

    const maxAlloVal =
      sub.signalledTokens > 0n
        ? maxAllo(targetApr, sub.signalledTokens, networkData2, futureStaked)
        : 0;

    return {
      ipfsHash: sub.ipfsHash,
      displayName: sub.displayName,
      network: sub.network,
      apr: sub.apr,
      wizardApr,
      wizardDailyRewards,
      wizardDailyRewardsCut,
      maxAllo: maxAlloVal,
      signalledTokens: sub.signalledTokens,
      deniedAt: sub.deniedAt,
    };
  });
});

// ---------- Opening metrics ----------

const openingStakeGrt = computed(() => {
  let sum = 0;
  for (const hash of wizardStore.selectedSubgraphHashes) {
    sum += wizardStore.newAllocations[hash] ?? 0;
  }
  return sum;
});

const availableStakeGrt = computed(() => {
  const available = weiToNumber(accountData.value?.availableStake ?? 0n);
  const closingGrt = weiToNumber(closingStake.value);
  return available + closingGrt - openingStakeGrt.value;
});

const openingRewardsPerYear = computed(() => {
  const network = networkData.value;
  if (!network) return 0;
  const totalSignalNum = weiToNumber(network.totalTokensSignalled);
  const issuancePerYearNum = weiToNumber(network.issuancePerYear);
  let sum = 0;
  for (const sub of wizardSubgraphs.value) {
    const newAlloGrt = wizardStore.newAllocations[sub.ipfsHash] ?? 0;
    if (!sub.deniedAt && sub.signalledTokens > 0n && newAlloGrt > 0) {
      const origSub = subFiltered.value.find(s => s.ipfsHash === sub.ipfsHash);
      if (!origSub) continue;
      const futureStakedWei = origSub.stakedTokens - (closingAlloByHash.value.get(sub.ipfsHash) ?? 0n);
      const newAlloWei = toWei(String(newAlloGrt));
      const totalStakedNum = weiToNumber(futureStakedWei + newAlloWei);
      if (totalStakedNum <= 0) continue;
      const signalNum = weiToNumber(sub.signalledTokens);
      sum += (signalNum / totalSignalNum) * issuancePerYearNum * (weiToNumber(newAlloWei) / totalStakedNum);
    }
  }
  return sum;
});

const openingAvgApr = computed(() => {
  return openingStakeGrt.value > 0
    ? (openingRewardsPerYear.value / openingStakeGrt.value) * 100
    : 0;
});

const afterAvgApr = computed(() => {
  const totalRewards = allocTotals.value.dailyRewardsSum * 365;
  const simulatedRewards = totalRewards
    - closingRewardsPerYear.value
    + openingRewardsPerYear.value;
  // simulatedStake = currentAllocated + availableStake (total indexer capital)
  const currentAllocated = weiToNumber(allocTotals.value.totalAllocatedStake);
  const availableGrt = weiToNumber(accountData.value?.availableStake ?? 0n);
  const simulatedStake = currentAllocated + availableGrt;
  return simulatedStake > 0 ? (simulatedRewards / simulatedStake) * 100 : 0;
});

const selectedMaxAllos = computed(() => {
  let sum = 0;
  for (const sub of wizardSubgraphs.value) {
    if (!sub.deniedAt && sub.signalledTokens > 0n && sub.maxAllo > 0) {
      sum += sub.maxAllo;
    }
  }
  return sum;
});

// ---------- Commands (Step 5) ----------

const indexingRuleCommands = computed(() => {
  const chainId = chainStore.activeChainId;
  let commands = '';
  // Delete rules for closing allocations
  for (const allo of closingAllocations.value) {
    commands += `graph indexer rules delete ${allo.ipfsHash} --network ${chainId}\n`;
  }
  // Set rules for new allocations
  for (const hash of wizardStore.selectedSubgraphHashes) {
    const amount = wizardStore.newAllocations[hash] ?? 0;
    if (amount > 0) {
      commands += `graph indexer rules set ${hash} allocationAmount ${amount} decisionBasis always --network ${chainId}\n`;
    }
  }
  return commands;
});

const actionsQueueCommands = computed(() => {
  const chainId = chainStore.activeChainId;
  let unallocate = '';
  let reallocate = '';
  let allocate = '';
  let reallocateLarger = '';
  const skip = new Set<string>();
  const selectedHashes = new Set(wizardStore.selectedSubgraphHashes);

  // Process closing allocations
  for (const allo of closingAllocations.value) {
    const hash = allo.ipfsHash;
    let poiArg = '';
    if (wizardStore.customPOIs[hash]) {
      if (wizardStore.customPOIs[hash] === '0x0') {
        poiArg = '0x0000000000000000000000000000000000000000000000000000000000000000 true 0 0x0000000000000000000000000000000000000000000000000000000000000000 ';
      } else {
        poiArg = `${wizardStore.customPOIs[hash]} true ${wizardStore.customBlockHeights[hash] ?? '0'} ${wizardStore.customPublicPOIs[hash] ?? ''} `;
      }
    }

    const newAmount = wizardStore.newAllocations[hash] ?? 0;
    if (selectedHashes.has(hash) && newAmount > 0) {
      // Reallocate
      const currentGrt = weiToNumber(allo.allocatedTokens);
      if (currentGrt > newAmount) {
        reallocate += `graph indexer actions queue reallocate ${hash} ${allo.id} ${newAmount} ${poiArg}--network ${chainId}\n`;
      } else {
        reallocateLarger += `graph indexer actions queue reallocate ${hash} ${allo.id} ${newAmount} ${poiArg}--network ${chainId}\n`;
      }
      skip.add(hash);
    } else {
      // Unallocate
      unallocate += `graph indexer actions queue unallocate ${hash} ${allo.id} ${poiArg}--network ${chainId}\n`;
    }
  }

  // Process new allocations (not reallocated)
  for (const hash of wizardStore.selectedSubgraphHashes) {
    const amount = wizardStore.newAllocations[hash] ?? 0;
    if (amount > 0 && !skip.has(hash)) {
      allocate += `graph indexer actions queue allocate ${hash} ${amount} --network ${chainId}\n`;
    }
  }

  return `${unallocate}${reallocate}${allocate}${reallocateLarger}`;
});

// Structured action inputs for agent API
const actionInputs = computed<ActionInput[]>(() => {
  const inputs: ActionInput[] = [];
  const skip = new Set<string>();
  const selectedHashes = new Set(wizardStore.selectedSubgraphHashes);

  // Process closing allocations
  for (const allo of closingAllocations.value) {
    const hash = allo.ipfsHash;
    const poi = wizardStore.customPOIs[hash] || undefined;
    const force = poi === '0x0' ? true : undefined;
    const resolvedPoi = poi === '0x0'
      ? '0x0000000000000000000000000000000000000000000000000000000000000000'
      : poi;

    const newAmount = wizardStore.newAllocations[hash] ?? 0;
    if (selectedHashes.has(hash) && newAmount > 0) {
      // Reallocate
      inputs.push({
        type: 'reallocate',
        deploymentID: hash,
        allocationID: allo.id,
        amount: String(newAmount),
        poi: resolvedPoi,
        force,
      });
      skip.add(hash);
    } else {
      // Unallocate
      inputs.push({
        type: 'unallocate',
        deploymentID: hash,
        allocationID: allo.id,
        poi: resolvedPoi,
        force,
      });
    }
  }

  // New allocations (not reallocated)
  for (const hash of wizardStore.selectedSubgraphHashes) {
    const amount = wizardStore.newAllocations[hash] ?? 0;
    if (amount > 0 && !skip.has(hash)) {
      inputs.push({
        type: 'allocate',
        deploymentID: hash,
        amount: String(amount),
      });
    }
  }

  return inputs;
});

// ---------- Event handlers ----------

function onAllocationUpdate(ipfsHash: string, amount: number) {
  wizardStore.newAllocations[ipfsHash] = amount;
}

function handleSetMaxAllos() {
  const entries = wizardSubgraphs.value
    .filter((s) => !s.deniedAt && s.signalledTokens > 0n)
    .map((s) => ({ ipfsHash: s.ipfsHash, maxAllo: s.maxAllo }));
  const usable = availableStakeGrt.value + openingStakeGrt.value;
  wizardStore.setAllMaxAllos(entries, usable);
}

// Apply minimums when they change
watch(
  () => wizardStore.minAllocation,
  () => {
    const subs = wizardSubgraphs.value.map((s) => ({
      ipfsHash: s.ipfsHash,
      signalled: s.signalledTokens,
      denied: !!s.deniedAt,
    }));
    wizardStore.setMinimums(subs);
  },
);

watch(
  () => wizardStore.minAllocation0Signal,
  () => {
    const subs = wizardSubgraphs.value.map((s) => ({
      ipfsHash: s.ipfsHash,
      signalled: s.signalledTokens,
      denied: !!s.deniedAt,
    }));
    wizardStore.setMinimums(subs);
  },
);
</script>

<style scoped>
.allocation-wizard {
  display: flex;
  flex-direction: column;
  padding-bottom: 5rem; /* space for footer */
}

.wizard-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background: var(--app-table-bg);
  border-top: 1px solid var(--app-surface-border-strong);
  z-index: 100;
}

.footer-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 1rem;
  min-width: 8rem;
}

.footer-label {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.footer-value {
  font-size: 1.2rem;
  font-weight: 700;
  margin-top: 0.25rem;
}

.footer-value.negative {
  color: var(--p-red-500);
}
</style>

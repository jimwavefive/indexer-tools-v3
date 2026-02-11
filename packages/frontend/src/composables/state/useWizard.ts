import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';

/**
 * Wizard state store — holds user selections and allocation amounts.
 *
 * All derived metrics (APR, available stake, commands) are computed in the
 * AllocationWizard view by combining this state with TanStack Query data.
 * This avoids the v3 anti-pattern of module-level store cross-dependencies.
 */
export const useWizardStore = defineStore('wizard', () => {
  // Step 1: Close allocations
  const closingAllocationIds = ref<string[]>([]);

  // Step 2: Custom POIs
  const customPOIs = reactive<Record<string, string>>({});
  const customBlockHeights = reactive<Record<string, string>>({});
  const customPublicPOIs = reactive<Record<string, string>>({});

  // Step 3: Pick subgraphs
  const selectedSubgraphHashes = ref<string[]>([]);

  // Step 4: Set allocations (ipfsHash -> GRT amount as number)
  const newAllocations = reactive<Record<string, number>>({});
  const minAllocation = ref(0);
  const minAllocation0Signal = ref(0);
  const reserveGRT = ref('1');

  function reset() {
    closingAllocationIds.value = [];
    selectedSubgraphHashes.value = [];
    for (const k of Object.keys(newAllocations)) delete newAllocations[k];
    for (const k of Object.keys(customPOIs)) delete customPOIs[k];
    for (const k of Object.keys(customBlockHeights)) delete customBlockHeights[k];
    for (const k of Object.keys(customPublicPOIs)) delete customPublicPOIs[k];
    minAllocation.value = 0;
    minAllocation0Signal.value = 0;
    reserveGRT.value = '1';
  }

  /** Initialize default allocation amounts for newly selected subgraphs */
  function initDefaults(
    subgraphs: { ipfsHash: string; signalled: bigint; denied: boolean }[],
  ) {
    for (const sub of subgraphs) {
      if (!(sub.ipfsHash in newAllocations)) {
        newAllocations[sub.ipfsHash] =
          sub.signalled === 0n || sub.denied
            ? minAllocation0Signal.value
            : minAllocation.value;
      }
    }
  }

  /** Apply minimum allocation to signalled subgraphs */
  function setMinimums(
    subgraphs: { ipfsHash: string; signalled: bigint; denied: boolean }[],
  ) {
    for (const sub of subgraphs) {
      const current = newAllocations[sub.ipfsHash] ?? 0;
      if (sub.signalled > 0n && !sub.denied && current < minAllocation.value) {
        newAllocations[sub.ipfsHash] = minAllocation.value;
      }
      if ((sub.signalled === 0n || sub.denied) && current < minAllocation0Signal.value) {
        newAllocations[sub.ipfsHash] = minAllocation0Signal.value;
      }
    }
  }

  /** Set all allocations to max allocations, scaled to fit available stake */
  function setAllMaxAllos(
    entries: { ipfsHash: string; maxAllo: number }[],
    usableGrt: number,
  ) {
    let totalMaxAllo = 0;
    const mapped = entries.map((e) => {
      const raw = e.maxAllo > 0 ? Math.floor(e.maxAllo) : 0;
      totalMaxAllo += raw;
      return { hash: e.ipfsHash, allo: raw };
    });

    if (usableGrt > 0 && totalMaxAllo > usableGrt) {
      const scale = usableGrt / totalMaxAllo;
      for (const entry of mapped) {
        entry.allo = Math.floor(entry.allo * scale);
      }
    } else if (usableGrt <= 0) {
      for (const entry of mapped) {
        entry.allo = 0;
      }
    }

    for (const entry of mapped) {
      newAllocations[entry.hash] = entry.allo;
    }
  }

  /** Reset all new allocations to 0 */
  function resetAllos() {
    for (const hash of selectedSubgraphHashes.value) {
      newAllocations[hash] = 0;
    }
  }

  return {
    closingAllocationIds,
    selectedSubgraphHashes,
    newAllocations,
    customPOIs,
    customBlockHeights,
    customPublicPOIs,
    minAllocation,
    minAllocation0Signal,
    reserveGRT,
    reset,
    initDefaults,
    setMinimums,
    setAllMaxAllos,
    resetAllos,
  };
});

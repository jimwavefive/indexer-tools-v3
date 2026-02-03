/**
 * Apply status filter to a list of items based on deployment status data.
 * @param {Array} items - Items to filter
 * @param {string} statusFilter - The filter type ('none', 'all', 'closable', 'healthy-synced', 'syncing', 'failed', 'non-deterministic', 'deterministic')
 * @param {Object} deploymentStatuses - Map of ipfsHash -> deployment status objects
 * @param {Function} getIpfsHash - Function to extract ipfsHash from an item
 * @returns {Array} Filtered items
 */
export function applyStatusFilter(items, statusFilter, deploymentStatuses, getIpfsHash) {
  if (statusFilter === 'none') {
    return items;
  }

  return items.filter((item) => {
    const hash = getIpfsHash(item);
    const status = deploymentStatuses[hash];

    switch (statusFilter) {
      case 'all':
        return status != undefined;

      case 'closable':
        return status != undefined && status.synced === true &&
          (status.fatalError == undefined || status.fatalError.deterministic === true);

      case 'healthy-synced':
        return status != undefined && status.health === 'healthy' && status.synced === true;

      case 'syncing':
        return status != undefined && status.health === 'healthy' && status.synced === false;

      case 'failed':
        return status != undefined && status.health === 'failed';

      case 'non-deterministic':
        return status != undefined && status.health === 'failed' &&
          status.fatalError != undefined && status.fatalError.deterministic === false;

      case 'deterministic':
        return status != undefined && status.health === 'failed' &&
          status.fatalError != undefined && status.fatalError.deterministic === true;

      default:
        return true;
    }
  });
}

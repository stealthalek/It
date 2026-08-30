function formatTicketNumber(id) {
  return `TCK-${String(id).padStart(6, '0')}`;
}

module.exports = { formatTicketNumber };

function assertCompanyScoped(rows, requester, getCompanyId) {
  if (requester.is_super_admin) return rows;
  const extract = getCompanyId || ((row) => row.company_id);
  for (const row of rows) {
    const companyId = extract(row);
    if (companyId != null && companyId !== requester.company_id) {
      const err = new Error('Isolamento tra aziende violato: riga fuori dal perimetro del richiedente');
      err.status = 500;
      throw err;
    }
  }
  return rows;
}

module.exports = { assertCompanyScoped };

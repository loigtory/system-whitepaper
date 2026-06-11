function assertValidDomainProfile(profile = {}) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("domain profile must be a JSON object.");
  }
  if (profile.artifactType !== "business-process-domain-profile") {
    throw new Error("domain profile artifactType must be business-process-domain-profile.");
  }
  if (!profile.profileId || typeof profile.profileId !== "string") {
    throw new Error("domain profile profileId is required.");
  }
  const serialized = JSON.stringify(profile);
  if (/password|secret|token|cookie|jdbc:|mysql:\/\/|postgres:\/\/|http:\/\/|https:\/\//i.test(serialized)) {
    throw new Error("domain profile contains forbidden secret, credential, URL, or connection-like content.");
  }
  return true;
}

function profileLabels(profile) {
  return profile && typeof profile.labels === "object" && !Array.isArray(profile.labels)
    ? profile.labels
    : {};
}

function applyDomainProfileLabel(profile, key, fallback) {
  const labels = profileLabels(profile);
  return String(labels[key] || fallback || "");
}

module.exports = {
  applyDomainProfileLabel,
  assertValidDomainProfile,
  profileLabels,
};

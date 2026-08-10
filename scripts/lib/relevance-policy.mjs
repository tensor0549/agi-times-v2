const excludedVertical = /\b(?:degree|curriculum|student|education|tutor(?:ing)?|admissions?|community detection|molecular|polymer|drug discovery|clinical|medical diagnosis|patient|financial trading|portfolio optimization|legal document|vehicle routing|supply chain|recommendation system|spatial transcriptomics)\b/i;

export function isExcludedAcademicVertical(...values) {
  return excludedVertical.test(values.filter(Boolean).join(' '));
}

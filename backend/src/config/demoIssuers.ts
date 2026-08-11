/**
 * Fixed demo-issuer keypairs so the seeded SEBI / NSE / RIL identities are
 * STABLE and can be pinned in a published trust directory
 * (backend/trusted-issuers.json). These are DEMO keys, NOT real SEBI keys -
 * committing them is intentional so the trust-anchored verify flow works on a
 * fresh clone. Production keys live in an HSM/KMS.
 */
export const DEMO_ISSUER_KEYS: Record<string, { publicKey: string; privateKey: string }> = {
  "SEBI-IND-0001": {
    "publicKey": "MCowBQYDK2VwAyEARFK1hGwtq7l6XBF/zOvDl2wI4H0fUNshc2MCgxtuhtM=",
    "privateKey": "MC4CAQAwBQYDK2VwBCIEIDEntZJNwooE1704OPstNzOQmG6OQIN63hm7N0lRGbvU"
  },
  "NSE-EXCH-0002": {
    "publicKey": "MCowBQYDK2VwAyEAYM5UTKc6qv6LdWFpSoSUC81x/CckPU14AVILPvdbUQ0=",
    "privateKey": "MC4CAQAwBQYDK2VwBCIEILlSF8eWTUOuHRJzyK6qllpXrwtL7PHWChwmRI/U6UP0"
  },
  "INE002A01018": {
    "publicKey": "MCowBQYDK2VwAyEA2j82UcvXbVthWvWMwpvHsvRuUXtOp2wDZIaH1rxqwGM=",
    "privateKey": "MC4CAQAwBQYDK2VwBCIEIORMxJT0X3AZY1QG1FMYI64wbIKlEJ99iFbWBC4Vy8mz"
  }
};

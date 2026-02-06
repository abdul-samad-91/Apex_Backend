# Daily Profit System - Quick Reference

## Calculation Formula

```javascript
Monthly Profit = (Locked Amount × Current ROI Rate) / 100
Daily Profit = Monthly Profit / 30 × ApexCoin Rate
Claimable = Daily Profit × Days Since Last Claim

// Example: 10,000 AC at 7% ROI, 5 days
// = (10,000 × 7) / 100 / 30 × 1.0 × 5 = $116.65
```

## Key Rules
- ✅ Uses **current admin ROI rate** (not locked-in rate)
- ✅ Profits accumulate daily, claim anytime
- ✅ Claimed profits → `accountBalance`, locked coins stay locked
- ✅ Must wait 24 hours between claims
- ✅ Multiple locks processed together

## How It Works

**Lock** → Entry status "active" → Earns using current ROI → **Claim** → Update `lastClaimDate` & `totalClaimedProfit`

On claim:
- Calculate days since last claim per entry
- Use current ROI rate for all calculations
- Sum claimable amounts
- Transfer to `accountBalance` and `totalRoiEarned`
- Reset claim date
  - `totalClaimedProfit` += claimed amount
  - `unclaimedProfit` = 0

---

## Database Schema

### User Model - lockedCoinsEntries Array

```javascript
lockedCoinsEntries: [{
  // Lock Details
  amount: Number,              // Amount of coins locked
  lockStartDate: Date,         // When coins were locked
  lockEndDate: Date,           // Lock expiry (14 months later)
  status: String,              // 'active', 'completed', 'unlock-pending', 'unlocked'
  
  // ROI Tracking
  roiRateAtLock: Number,       // Historical: ROI rate when locked (for reference)
                               // NOT used for calculations anymore
  
  // Claim Tracking
  unclaimedProfit: Number,     // Always 0 after claim (reset field)
  lastClaimDate: Date,         // Last time profit was claimed (null if never claimed)
  totalClaimedProfit: Number,  // Lifetime total claimed from this entry
  
  // Timestamps
  createdAt: Date,             // Entry creation timestamp
  
  // Unlock Request (if user wants early unlock)
  unlockRequest: { ... }
}]
```

### User Model - Top Level Fields

```javascript
{
  apexCoins: Number,           // Available (unlocked) coins
  lockedApexCoins: Number,     // Total locked across all entries
  accountBalance: Number,      // Dollar balance (where claims go)
  totalRoiEarned: Number,      // Lifetime earnings from all claims
  lastLockDate: Date,          // Last time user locked coins
  // ... other fields
}
```

---

## API Endpoints

### 1. GET User by ID - `/api/users/:id`
**Purpose:** View user details including claimable profits

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "user": {
    "_id": "...",
    "fullName": "John Doe",
    "apexCoins": 5000,
    "accountBalance": 1250.50,
    "lockedApexCoins": 15000,
    "totalRoiEarned": 850.75,
    "currentRoiRate": 7,
    "roiData": {
      "lockedEntries": [
        {
          "entryId": "...",
          "amount": 5000,
          "lockStartDate": "2026-01-15T10:30:00.000Z",
          "lockEndDate": "2027-03-15T10:30:00.000Z",
          "status": "active",
          "roiRateAtLock": 5,         // Historical (not used)
          "currentRoiRate": 7,        // Used for calculations
          "monthlyProfit": 35.00,
          "dailyProfit": 1.17,
          "totalProfit": 25.74,       // Total earned since lock start
          "claimableProfit": 5.85,    // Ready to claim now
          "daysSinceLastClaim": 5,
          "lastClaimDate": "2026-02-01T10:00:00.000Z",
          "totalClaimedProfit": 125.50,
          "daysElapsed": 22,
          "monthsCompleted": 0
        }
      ],
      "totalLockedAmount": 15000,
      "totalClaimableAmount": 15.75,  // Sum across all entries
      "currentRoiRate": 7,
      "apexCoinToDollarRate": 1
    }
  }
}
```

**Calculation Details:**
- `monthlyProfit` = (amount × currentRoiRate) / 100 × apexCoinToDollarRate
- `dailyProfit` = monthlyProfit / 30
- `claimableProfit` = dailyProfit × daysSinceLastClaim
- `totalProfit` = dailyProfit × daysElapsed (since lock start)

---

### 2. POST Claim Daily Profits - `/api/users/claimDailyProfits`
**Purpose:** Claim accumulated profits from all active locks

**Authentication:** Required (Bearer token)

**Request Body:** None (uses authenticated user)

**Success Response (200):**
```json
{
  "message": "Daily profits claimed successfully",
  "data": {
    "totalClaimedAmount": 65.52,
    "newAccountBalance": 1316.02,
    "totalRoiEarned": 916.27,
    "claimDetails": [
      {
        "entryId": "65a1b2c3d4e5f6789abcdef0",
        "amount": 5000,
        "daysSinceLastClaim": 5,
        "claimedAmount": 5.85,
        "dailyRate": 1.17
      },
      {
        "entryId": "65a1b2c3d4e5f6789abcdef1",
        "amount": 10000,
        "daysSinceLastClaim": 25,
        "claimedAmount": 58.50,
        "dailyRate": 2.34
      }
    ],
    "claimedAt": "2026-02-06T15:30:45.123Z"
  }
}
```

**Error Responses:**

| Status | Message | Reason |
|--------|---------|--------|
| 401 | "User not authenticated" | No auth token |
| 404 | "User not found" | Invalid user ID |
| 400 | "No active locked entries found" | No locks in active status |
| 400 | "No profits available to claim yet" | Must wait at least 1 day |
| 400 | "ApexCoin rate not set yet" | Admin hasn't set coin rate |
| 400 | "ROI rate not set by admin" | Admin hasn't set ROI rate |
| 500 | "Error claiming daily profits" | Server error |

---

## Detailed Examples

### Example 1: Single Lock - First Claim

**Initial State:**
```
User locks 10,000 ApexCoins on Jan 1, 2026
- Lock Amount: 10,000 AC
- ROI Rate at Lock: 5%
- Lock Start: Jan 1, 2026
- Last Claim Date: null (never claimed)
```

**5 Days Later (Jan 6, 2026):**
```
Current ROI Rate changed to: 7%
ApexCoin Rate: 1.0

Calculation:
Monthly Profit = (10,000 × 7) / 100 = 700 AC
Daily Profit = 700 / 30 = 23.33 AC/day = $23.33/day
Days Since Last Claim = 5 days (from lock start)
Claimable Profit = 23.33 × 5 = $116.65
```

**After Claiming:**
```json
{
  "totalClaimedAmount": 116.65,
  "newAccountBalance": 116.65,      // Added to balance
  "totalRoiEarned": 116.65,         // Lifetime tracker
  "claimDetails": [{
    "entryId": "...",
    "amount": 10000,
    "daysSinceLastClaim": 5,
    "claimedAmount": 116.65,
    "dailyRate": 23.33
  }]
}
```

**Entry Updated:**
```javascript
{
  lastClaimDate: "2026-01-06T12:00:00.000Z",
  totalClaimedProfit: 116.65,
  unclaimedProfit: 0
}
```

---

### Example 2: Multiple Locks - Second Claim

**User's Locks:**
```
Lock #1:
- Amount: 5,000 AC
- Lock Date: Jan 1, 2026
- Last Claim: Feb 1, 2026 (claimed $58.33)
- Total Claimed: $58.33

Lock #2:
- Amount: 10,000 AC
- Lock Date: Jan 15, 2026
- Last Claim: null (never claimed)
- Total Claimed: $0
```

**Claiming on Feb 6, 2026:**
```
Current ROI Rate: 8%
ApexCoin Rate: 1.0
Current Date: Feb 6, 2026

Lock #1 Calculation:
- Days Since Claim = Feb 6 - Feb 1 = 5 days
- Monthly Profit = (5,000 × 8) / 100 = 400 AC
- Daily Profit = 400 / 30 = 13.33 AC/day = $13.33/day
- Claimable = 13.33 × 5 = $66.65

Lock #2 Calculation:
- Days Since Claim = Feb 6 - Jan 15 = 22 days
- Monthly Profit = (10,000 × 8) / 100 = 800 AC
- Daily Profit = 800 / 30 = 26.67 AC/day = $26.67/day
- Claimable = 26.67 × 22 = $586.74

Total Claimable = $66.65 + $586.74 = $653.39
```

**After Claiming:**
```json
{
  "totalClaimedAmount": 653.39,
  "newAccountBalance": 1653.39,     // Previous + claimed
  "totalRoiEarned": 711.72,         // Previous 58.33 + 653.39
  "claimDetails": [
    {
      "entryId": "lock1_id",
      "amount": 5000,
      "daysSinceLastClaim": 5,
      "claimedAmount": 66.65,
      "dailyRate": 13.33
    },
    {
      "entryId": "lock2_id",
      "amount": 10000,
      "daysSinceLastClaim": 22,
      "claimedAmount": 586.74,
      "dailyRate": 26.67
    }
  ]
}
```

**Entries Updated:**
```javascript
Lock #1: {
  lastClaimDate: "2026-02-06T...",
  totalClaimedProfit: 124.98,  // 58.33 + 66.65
  unclaimedProfit: 0
}

Lock #2: {
  lastClaimDate: "2026-02-06T...",
  totalClaimedProfit: 586.74,  // First claim
  unclaimedProfit: 0
}
```

---

### Example 3: ROI Rate Change Impact

**Scenario:**
```
User locks 10,000 AC on Jan 1 at 5% ROI
Admin changes ROI to 8% on Jan 15
User claims on Feb 1
```

**Calculation (Using Current 8% Rate):**
```
Days Since Lock = 31 days
Current ROI Rate = 8% (not 5%)

Monthly Profit = (10,000 × 8) / 100 = 800 AC
Daily Profit = 800 / 30 = 26.67 AC/day = $26.67/day
Claimable = 26.67 × 31 = $826.77
```

**Important:** Even though the user locked at 5%, they earn at the current 8% rate!

---

## Business Rules

### 1. ROI Rate Rules
- ✅ Always uses **current admin-set ROI rate**
- ✅ Rate changes affect ALL existing locks immediately
- ✅ Historical `roiRateAtLock` stored but not used for calculations
- ✅ If no ROI rate set, API returns error

### 2. Claiming Rules
- ✅ Must wait at least 1 full day between claims
- ✅ Can claim from multiple locks in one transaction
- ✅ All active locks processed together
- ✅ Entries with 0 days since last claim are skipped
- ✅ If no claimable profit, returns error message

### 3. Calculation Rules
- ✅ 1 month = 30 days (fixed for calculation consistency)
- ✅ Days calculated using floor division (no partial days)
- ✅ Dollar amounts rounded to 2 decimal places
- ✅ ApexCoin rate used for conversion to dollars

### 4. Transfer Rules
- ✅ Claimed profits go to `accountBalance` (not `apexCoins`)
- ✅ Original locked amount stays in `lockedApexCoins`
- ✅ Both entry-level and user-level totals updated
- ✅ Transaction is atomic (all or nothing)

### 5. Lock Status Rules
- ✅ Only "active" status locks earn profits
- ✅ "unlock-pending" locks stop earning
- ✅ "completed" locks no longer earn
- ✅ "unlocked" locks are removed from calculations

---

## Testing Scenarios

### Test Case 1: First Day Claim
```
Setup:
- Lock 1,000 AC at any ROI rate
- Wait 24+ hours

Expected:
- claimableProfit = daily rate × 1
- daysSinceLastClaim = 1
- Can successfully claim

Verify:
- accountBalance increases
- lastClaimDate updates
- totalClaimedProfit = claimed amount
```

### Test Case 2: Claim Before 24 Hours
```
Setup:
- Lock coins and immediately try to claim

Expected:
- Error: "No profits available to claim yet"
- claimableAmount = 0

Verify:
- No changes to database
- accountBalance unchanged
```

### Test Case 3: ROI Rate Change
```
Setup:
- Lock 5,000 AC at 5% ROI
- Admin changes to 10% ROI
- Wait 5 days and claim

Expected:
- Uses 10% rate (not 5%)
- claimableProfit calculated with new rate

Calculation:
Monthly = (5,000 × 10) / 100 = 500
Daily = 500 / 30 = 16.67
Claimable = 16.67 × 5 = 83.35
```

### Test Case 4: Multiple Claims
```
Setup:
- Lock 10,000 AC
- Claim after 5 days
- Claim again after 3 more days

First Claim:
- daysSinceLastClaim = 5
- claimableProfit = daily × 5

Second Claim:
- daysSinceLastClaim = 3 (not 8!)
- claimableProfit = daily × 3
- totalClaimedProfit = first + second
```

### Test Case 5: Multiple Locks
```
Setup:
- Lock #1: 5,000 AC on Day 1
- Lock #2: 3,000 AC on Day 5
- Claim on Day 10

Expected:
- Lock #1: 10 days of profit
- Lock #2: 5 days of profit
- Total = both summed
- Both entries updated with lastClaimDate
```

### Test Case 6: No Active Locks
```
Setup:
- User has no locked coins
- Try to claim

Expected:
- Error: "No active locked entries found"
- claimableAmount = 0
```

### Test Case 7: Long Period Claim
```
Setup:
- Lock 10,000 AC
- Wait 90 days without claiming

Expected:
- daysSinceLastClaim = 90
- Large claimable amount
- Single claim gets all 90 days

Calculation:
Daily = 23.33 (at 7% ROI, 1.0 rate)
Claimable = 23.33 × 90 = $2,099.70
```

---

## Implementation Notes

### Performance Considerations
- ✅ Calculations done on-demand (no cron jobs)
- ✅ ROI rate fetched once per request
- ✅ Loop through entries is O(n) where n = locked entries
- ✅ Database update is atomic transaction

### Accuracy
- All calculations use JavaScript numbers (64-bit float)
- Final amounts rounded to 2 decimals with `toFixed(2)`
- Days calculated with `Math.floor()` for consistency
- No accumulation of floating-point errors

### Scalability
- Works with any number of locked entries per user
- Admin can change ROI rate globally without migrations
- Historical data preserved in `roiRateAtLock`
- Can add analytics by querying `totalClaimedProfit`

---

## Summary

### What Gets Updated on Claim:

**Per Entry:**
- `lastClaimDate` → Current timestamp
- `totalClaimedProfit` → Increased by claimed amount
- `unclaimedProfit` → Reset to 0

**Per User:**
- `accountBalance` → Increased by total claimed
- `totalRoiEarned` → Increased by total claimed

**Response Data:**
- Returns total claimed amount
- Shows per-entry breakdown
- Includes new balances
- Timestamp of claim

### Key Formulas:
```
Daily Profit = ((Amount × CurrentROI) / 100) / 30 × CoinRate
Claimable = Daily Profit × Days Since Last Claim
New Balance = Old Balance + Total Claimable
```

---

## API Testing with cURL

```bash
# Get user with claimable amounts
curl -X GET http://localhost:5000/api/users/:userId \
  -H "Authorization: Bearer YOUR_TOKEN"

# Claim daily profits
curl -X POST http://localhost:5000/api/users/claimDailyProfits \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## Questions & Answers

**Q: Does the locked amount decrease when claiming?**  
A: No, only profits are claimed. The locked amount stays locked for 14 months.

**Q: What happens if admin changes ROI rate?**  
A: All future calculations immediately use the new rate for all users.

**Q: Can I claim multiple times per day?**  
A: No, must wait at least 24 hours between claims.

**Q: Where do claimed profits go?**  
A: To `accountBalance` (in dollars), not to `apexCoins`.

**Q: What if I have multiple locks at different dates?**  
A: Each lock tracks independently. One claim processes all active locks together.

**Q: Do I lose profit if I don't claim daily?**  
A: No, profits accumulate. You can claim weekly, monthly, or anytime.

**Q: What if ROI rate drops?**  
A: New calculations use the lower rate. Past claimed profits are unaffected.

---

**Document Version:** 1.0  
**Last Updated:** February 6, 2026  
**Author:** Apex Backend Development Team

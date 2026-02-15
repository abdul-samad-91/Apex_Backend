# Downchain Profit Share Feature

## Overview

This feature allows upline users to claim their profit shares from their downchain network **independently**, without waiting for downchain users to claim their daily profits first.

## Problem Solved

**Previous System:**
- When Basit had claimable daily profit, Samad and Hanzala (his uplines) would only receive their profit shares AFTER Basit claimed his profit
- If Basit never claimed, the uplines would never receive their share
- Uplines were dependent on downchain users' claiming behavior

**New System:**
- Upline users can claim their profit shares based on what's currently **claimable** in their downchain
- The profit share is calculated from the accumulated daily profits of all downchain users with active locked entries
- Independent claiming: Uplines don't need to wait for downchain users to claim

## How It Works

### Scenario Example

**Network Structure:**
```
Root (6 active direct referrals)
  └─ Hanzala (1 active direct referral: Samad)
      └─ Samad (1 active direct referral: Basit)
          └─ Basit (active, has 100 locked coins)
```

### Old vs New Behavior

#### OLD BEHAVIOR:
1. Basit has 10 days of accumulated profit ($50 claimable)
2. Hanzala can't claim his share until Basit claims
3. If Basit doesn't claim, Hanzala gets nothing

#### NEW BEHAVIOR:
1. Basit has 10 days of accumulated profit ($50 claimable)
2. Hanzala can claim his Level 2 share (7% of $50 = $3.50) **immediately**
3. Root can claim his Level 3 share (6% of $50 = $3.00) **immediately**
4. Basit's claimable amount doesn't change - he still has $50 to claim whenever he wants

### Profit Share Tracking

The system tracks:
- **Per downchain user**: When each upline last claimed from each specific downchain user
- **Per locked entry**: When each upline last claimed from each specific locked entry
- **Prevents double-claiming**: Each upline can only claim accumulated profits since their last claim

## API Endpoints

### 1. Get Available Downchain Profit Shares

**Endpoint:** `GET /api/user/availableDownchainProfitShares`

**Auth Required:** Yes (Bearer token)

**Description:** View how much profit share is currently claimable from the entire downchain without actually claiming it.

**Response Example:**
```json
{
  "message": "Available downchain profit shares calculated",
  "data": {
    "totalClaimable": 25.50,
    "activeDirectReferrals": 3,
    "unlockedLevels": 3,
    "downchainUsersCount": 5,
    "details": [
      {
        "downchainUserId": "507f1f77bcf86cd799439011",
        "downchainUserName": "Basit Khan",
        "downchainUserEmail": "basit@example.com",
        "level": 2,
        "sharePercentage": 7,
        "downchainClaimableAmount": 50.00,
        "uplineShareAmount": 3.50,
        "activeEntries": 1
      },
      {
        "downchainUserId": "507f1f77bcf86cd799439012",
        "downchainUserName": "Ahmed Ali",
        "downchainUserEmail": "ahmed@example.com",
        "level": 1,
        "sharePercentage": 10,
        "downchainClaimableAmount": 220.00,
        "uplineShareAmount": 22.00,
        "activeEntries": 2
      }
    ]
  }
}
```

### 2. Claim Downchain Profit Shares

**Endpoint:** `POST /api/user/claimDownchainProfitShares`

**Auth Required:** Yes (Bearer token)

**Description:** Claim all available profit shares from the entire downchain. This transfers the accumulated profit shares to the user's account balance.

**Response Example:**
```json
{
  "message": "Downchain profit shares claimed successfully",
  "data": {
    "totalClaimedAmount": 25.50,
    "newAccountBalance": 1525.50,
    "totalProfitShareEarned": 425.50,
    "claimedAt": "2026-02-15T10:30:00.000Z",
    "activeDirectReferrals": 3,
    "unlockedLevels": 3,
    "downchainUsersProcessed": 5,
    "claimDetails": [
      {
        "downchainUserId": "507f1f77bcf86cd799439011",
        "downchainUserName": "Basit Khan",
        "level": 2,
        "sharePercentage": 7,
        "downchainClaimableAmount": 50.00,
        "shareAmount": 3.50,
        "entries": [
          {
            "entryId": "507f1f77bcf86cd799439013",
            "amount": 100,
            "daysSinceLastClaim": 10,
            "claimableProfit": 50.00
          }
        ]
      }
    ]
  }
}
```

## Level Unlock Requirements

The profit share system has 12 levels. Each level requires a specific number of **active direct referrals**:

| Level | Active Direct Referrals Required | Share Percentage |
|-------|----------------------------------|------------------|
| 1     | 1                                | 10%              |
| 2     | 2                                | 7%               |
| 3     | 3                                | 6%               |
| 4     | 4                                | 5%               |
| 5     | 5                                | 2%               |
| 6     | 6                                | 1%               |
| 7     | 7                                | 1%               |
| 8     | 8                                | 0.5%             |
| 9     | 9                                | 0.5%             |
| 10    | 10                               | 0.5%             |
| 11    | 11                               | 0.5%             |
| 12    | 12                               | 0.5%             |

**Example:**
- If Hanzala has 1 active direct referral, he can only claim Level 1 shares
- If Hanzala has 3 active direct referrals, he can claim Level 1, 2, and 3 shares
- Levels beyond the number of active direct referrals are locked

## Database Schema Changes

### User Model (user.model.js)

Added new field:
```javascript
lastProfitShareClaimDates: {
  type: Map,
  of: Date,
  default: new Map()
}
```

**Purpose:** Tracks when each upline user last claimed profit shares from each downchain user's locked entry to prevent double-claiming.

**Key Format:** `{downchainUserId}_{lockedEntryId}`

**Example:**
```javascript
{
  "507f1f77bcf86cd799439011_507f1f77bcf86cd799439013": "2026-02-15T10:30:00.000Z",
  "507f1f77bcf86cd799439012_507f1f77bcf86cd799439014": "2026-02-14T15:20:00.000Z"
}
```

## Implementation Details

### Calculation Logic

1. **Find Downchain Users:**
   - Query all users who have the claiming user in their `referralChain`

2. **Determine Level:**
   - For each downchain user, find the position of the claiming user in their `referralChain`
   - This determines the level (1-12)

3. **Check Level Unlock:**
   - Count the claiming user's active direct referrals
   - Skip if level is not unlocked (activeDirectReferrals < level)

4. **Calculate Claimable Profit:**
   - For each active locked entry of the downchain user:
     - Get the last claim date for THIS upline from `lastProfitShareClaimDates`
     - Calculate days since last claim
     - Calculate daily profit based on current ROI rate
     - Calculate total claimable profit for those days

5. **Calculate Share:**
   - Apply the level's share percentage to the downchain user's claimable amount
   - Record the profit share transaction
   - Update the last claim date

### Transaction Recording

When an upline claims:
- Creates `ProfitShareTransaction` records for each downchain user
- Sets `isClaimed: true` and `claimedAt: now`
- Updates upline's `accountBalance` and `totalProfitShareEarned`
- Updates `lastProfitShareClaimDates` map to prevent double-claiming

## Advantages

1. **Independence:** Uplines can claim regardless of downchain behavior
2. **Fairness:** Uplines get their share based on what's claimable, not just what's been claimed
3. **Flexibility:** Each upline tracks their own claim history independently
4. **No Loss:** Downchain users' claimable amounts are unaffected
5. **Transparency:** Users can view available profit shares before claiming

## Migration Notes

- **Backward Compatible:** Existing `claimProfitShares` endpoint still works for old profit share transactions
- **New Field:** `lastProfitShareClaimDates` defaults to empty Map for existing users
- **First Claim:** On first claim, uses the locked entry's `lockStartDate` as the starting point

## Testing Scenarios

### Scenario 1: Basic Claim
1. User A has downchain user B with 100 coins locked
2. 10 days pass
3. User A claims downchain profit shares
4. User A receives their level share (e.g., 10% of B's claimable profit)
5. User B still has the full amount to claim

### Scenario 2: Multiple Downchain Users
1. User A has 3 downchain users (B, C, D) at different levels
2. Each has different locked amounts and time periods
3. User A claims once
4. Receives aggregated profit share from all three users
5. Each user's claim amount is calculated independently

### Scenario 3: Prevent Double Claiming
1. User A claims on Day 10
2. Receives share for 10 days of accumulated profit
3. User A tries to claim again immediately
4. System returns 0 (no new accumulated profit since last claim)
5. User A can claim again after downchain users accumulate more profit

### Scenario 4: Level Unlock Changes
1. User A has 1 active direct referral (Level 1 unlocked)
2. Claims profit share at Level 1 (10%)
3. User A gains another active direct referral (Level 2 now unlocked)
4. Next claim includes both Level 1 and Level 2 shares

## Error Handling

- **No Downchain Users:** Returns message with 0 claimable amount
- **Levels Not Unlocked:** Only processes unlocked levels
- **No Claimable Profit:** Returns message explaining no new profit since last claim
- **ROI/Coin Rate Not Set:** Returns 400 error with appropriate message

## Frontend Integration

### Recommended UI Flow

1. **Dashboard Widget:** Show "Available Profit Shares" with total claimable amount
2. **View Details Button:** Opens modal showing breakdown by downchain user
3. **Claim Button:** Triggers claim endpoint and shows success message
4. **History Tab:** Shows past claims with details

### Example UI Display

```
┌─────────────────────────────────────────┐
│  Downchain Profit Shares                │
├─────────────────────────────────────────┤
│  Available to Claim: $25.50             │
│  Unlocked Levels: 3 of 12               │
│  Downchain Users: 5                     │
│                                         │
│  [View Details]  [Claim Now]           │
└─────────────────────────────────────────┘
```

## Date: February 15, 2026
## Version: 1.0.0

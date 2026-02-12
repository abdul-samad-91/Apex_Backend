# Referral Path Feature - Documentation

## Overview
The referral path feature has been implemented to show the complete chain of referrals from the root user (logged-in user) down to the end user who generated the bonus or profit share.

## What Changed?

### New Helper Function: `buildReferralPath`
A new helper function has been added to trace the complete referral chain between two users.

**Parameters:**
- `rootUserId` - The starting user (typically the logged-in user receiving the bonus)
- `endUserId` - The end user who generated the profit/bonus

**Returns:**
An array of user objects showing the complete path, with each user having:
- `userId` - User ID
- `fullName` - User's full name
- `email` - User's email
- `level` - Their level in the chain (0 = root user)

### Updated APIs

#### 1. GET `/bonusHistory`
Now includes a `referralPath` field in each bonus transaction showing the complete chain from the root user to the user who staked coins.

**Example Response:**
```json
{
  "message": "Bonus history retrieved",
  "data": {
    "bonuses": [
      {
        "_id": "...",
        "fromUserId": {
          "_id": "69899715c4e3ebda7a0cb36a",
          "fullName": "Hanzala Khattak 1",
          "email": "m.hanzalakhattak47@gmail.com"
        },
        "bonusAmount": 9,
        "level": 3,
        "referralPath": [
          {
            "userId": "6984a86799a9708a6b9f0688",
            "fullName": "Root User",
            "email": "root@example.com",
            "level": 0
          },
          {
            "userId": "698xxxx",
            "fullName": "Level 1 User",
            "email": "level1@example.com",
            "level": 1
          },
          {
            "userId": "698yyyy",
            "fullName": "Level 2 User",
            "email": "level2@example.com",
            "level": 2
          },
          {
            "userId": "69899715c4e3ebda7a0cb36a",
            "fullName": "Hanzala Khattak 1",
            "email": "m.hanzalakhattak47@gmail.com",
            "level": 3
          }
        ]
      }
    ]
  }
}
```

#### 2. GET `/profitShareHistory`
Now includes a `referralPath` field in each profit share transaction showing the complete chain from the root user to the user who claimed ROI.

**Example Response:**
```json
{
  "message": "Profit share history retrieved",
  "data": {
    "profitShares": [
      {
        "_id": "698daf12f1a8cc108e18e32e",
        "fromUserId": {
          "_id": "69899715c4e3ebda7a0cb36a",
          "fullName": "Hanzala Khattak 1",
          "email": "m.hanzalakhattak47@gmail.com"
        },
        "shareAmount": 0.012,
        "level": 3,
        "referralPath": [
          {
            "userId": "6984a86799a9708a6b9f0688",
            "fullName": "Root User",
            "email": "root@example.com",
            "level": 0
          },
          {
            "userId": "698xxxx",
            "fullName": "Level 1 User",
            "email": "level1@example.com",
            "level": 1
          },
          {
            "userId": "698yyyy",
            "fullName": "Level 2 User",
            "email": "level2@example.com",
            "level": 2
          },
          {
            "userId": "69899715c4e3ebda7a0cb36a",
            "fullName": "Hanzala Khattak 1",
            "email": "m.hanzalakhattak47@gmail.com",
            "level": 3
          }
        ]
      }
    ]
  }
}
```

## How to Interpret the Referral Path

The `referralPath` array shows the complete chain from top to bottom:
- **Index 0** (Level 0): Root user (the one receiving the bonus/profit)
- **Index 1** (Level 1): Direct referral of the root user
- **Index 2** (Level 2): Referral of the level 1 user
- **Last Index** (Level N): The end user who triggered the bonus/profit

### Example:
If you're seeing a profit share at "level 3" with this path:
```
Root User (You) → John → Mary → Hanzala
```

This means:
- You referred John (level 1)
- John referred Mary (level 2)
- Mary referred Hanzala (level 3)
- Hanzala claimed ROI, generating profit share for you

You can now see exactly which direct referral's downline is generating profits for you!

## Benefits

1. **Transparency**: Users can see exactly which downline users are generating their bonuses and profit shares.
2. **Network Tracking**: Users can identify which of their direct referrals have the most productive downlines.
3. **Performance Analysis**: Users can analyze which referral chains are most profitable.
4. **Better Decision Making**: Users can focus on nurturing the most active referral branches.

## Technical Notes

- The function uses the `referredBy` field to traverse up the chain from the end user to the root user.
- The path is built efficiently using async/await to fetch user data.
- If a path cannot be traced (e.g., user not found), an empty array is returned.
- The function is exported and can be reused in other parts of the application if needed.

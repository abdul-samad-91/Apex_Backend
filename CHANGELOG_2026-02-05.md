
# Apex Backend - Detailed Changelog (2026-02-05)

## 1. Lock ApexCoins Functionality

- **Lock Duration:** Users can now lock ApexCoins for a fixed period of 14 months per lock.
- **Multiple Locks:** Each lock is tracked as a separate entry in the `lockedCoinsEntries` array. Users can lock additional coins every 24 hours, and each lock is independent.
- **Lock Entry Structure:**
	- `amount`: Number of coins locked in this entry
	- `lockStartDate` / `lockEndDate`: Start and end of lock period
	- `status`: `active`, `unlock-pending`, or `unlocked`
	- `createdAt`: When the lock was created
	- `unlockRequest`: Details if user requests early unlock (see below)

**Example:**
```json
{
	"lockedCoinsEntries": [
		{
			"amount": 11000,
			"lockStartDate": "2026-02-05T08:17:19.721Z",
			"lockEndDate": "2027-04-05T08:17:19.721Z",
			"status": "active",
			"createdAt": "2026-02-05T08:17:19.721Z",
			"_id": "..."
		}
	]
}
```

## 2. ROI Rate Handling

- **Per-Lock ROI Rate:** Each lock entry uses the ROI rate that was active at the time of locking. This rate is used for all profit calculations for that entry, regardless of future rate changes.
- **Changing ROI Rate:** If the admin changes the ROI rate, only new locks will use the new rate. Existing locked entries keep their original rate.

**Example:**
	- Lock 1 at 6% ROI → always uses 6%
	- Lock 2 (after rate changes to 8%) → uses 8%

## 3. Unlock ApexCoins Functionality

- **Unlock Restrictions:**
	- Cannot unlock before 60 days from lock start.
	- Unlocking between 60-89 days: 25% penalty, 7-day processing period.
	- Unlocking between 90-179 days: 20% penalty, 7-day processing period.
	- Unlocking after 180 days: 10% penalty, 7-day processing period.
- **Unlock Request:**
	- User requests unlock for a specific lock entry.
	- System calculates days elapsed, applies penalty, and sets a 7-day processing period.
	- Entry status changes to `unlock-pending` and unlock details are stored in `unlockRequest`.
- **Admin Approval:**
	- After 7 days, admin can approve the unlock.
	- Upon approval, coins (minus penalty) are migrated to user's `apexCoins` and entry status becomes `unlocked`.

**UnlockRequest Structure:**
```json
{
	"unlockRequest": {
		"requestedAt": "2026-02-10T10:00:00Z",
		"processAfter": "2026-02-17T10:00:00Z",
		"penaltyPercentage": 25,
		"penaltyAmount": 2500,
		"amountAfterPenalty": 7500,
		"daysElapsedAtRequest": 65,
		"approvedAt": null,
		"approvedBy": null
	}
}
```

## 4. Admin Controls

- **View Pending Unlocks:** Admin can view all unlock requests that are pending and see if the 7-day period has passed.
- **Approve Unlocks:** Admin can approve unlocks after the processing period, which migrates the coins (after penalty) to the user's available balance.

## 5. API Endpoints Added/Updated

- `POST /lockApexCoins` — Lock coins (user)
	- Body: `{ "amount": 1000 }`
- `POST /requestUnlock` — User requests unlock for a specific entry
	- Body: `{ "entryId": "..." }`
- `GET /pendingUnlocks` — Admin views all pending unlock requests
- `POST /approveUnlock` — Admin approves unlock after 7 days
	- Body: `{ "userId": "...", "entryId": "..." }`

## 6. Data Model Changes

- `lockedCoinsEntries` now includes:
	- `unlockRequest` object for tracking unlock requests, penalties, and approval
	- `status` field with new values: `active`, `unlock-pending`, `unlocked`

## 7. ROI & Profit Tracking

- **Per-Entry Profits:** Each lock entry in `roiData.lockedEntries` shows:
	- `monthlyProfit`: Profit per month for that entry
	- `dailyProfit`: Profit per day
	- `totalProfit`: Accumulated profit so far
- **Total Locked:** `roiData.totalLockedAmount` is the sum of all currently locked coins
- **Total Earnings:** Sum `totalProfit` from all entries for total ROI earned

**Example ROI Data:**
```json
{
	"roiData": {
		"lockedEntries": [
			{
				"entryId": "...",
				"amount": 11000,
				"monthlyProfit": 662.2,
				"dailyProfit": 22.07,
				"totalProfit": 44.14,
				"daysElapsed": 2,
				"monthsCompleted": 0
			},
			{
				"entryId": "...",
				"amount": 5000,
				"monthlyProfit": 301,
				"dailyProfit": 10.03,
				"totalProfit": 20.06,
				"daysElapsed": 2,
				"monthsCompleted": 0
			}
		],
		"totalLockedAmount": 16000,
		"currentRoiRate": 6.02,
		"apexCoinToDollarRate": 1
	}
}
```

---
**All changes are now live in the backend. For any questions or further details, refer to the code or contact the development team.**

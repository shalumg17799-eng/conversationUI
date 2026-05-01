# Report Hub: Implementation Change Brief
**Prepared for:** Shobhit Singh
**Source:** Report Hub Review w/ Mani + Prior Sessions
**Review scheduled:** Tomorrow at 11:00 AM with Mani

---

## How to Use This File

Paste this document into Claude at the start of your session. Use it as your implementation guide. Work through each section in order. After completing a section, confirm it works across **both personas** before moving on.

---

## 1. UI and Labeling

### Talk Screen Header
- **Change the header** on the Talk screen from:
  > "What would you like to work on?"
- To:
  > "Explore your report data set and ask questions"

---

## 2. Navigation and Access Behavior

### Frequently Accessed Items
- Each card must include a **pill label** indicating whether the item is a **Dataset** or a **Report**
- Clicking the card must open the underlying report or dataset directly when the user has access
- Current behavior (routing to conversational analytics) is **incorrect and must be rewired**
- When the user does **not** have access, clicking must trigger an **access-request flow**

### Trending in Your Area Items
- Apply the same routing logic as Frequently Accessed:
  - User **has access**: open the report or dataset directly
  - User **does not have access**: trigger the access-request flow

### Quick Summary Banners (All Four)
When a user clicks any of the four quick summary banners, it should open a conversation view that displays a chart. From that conversation view, the user must have two available actions:

1. **Add to Report**: an action that allows the user to add the chart to any report
2. **Go to Source**: an action that navigates the user to the report or dataset that the summary content came from

---

## 3. Rendering and Validation

### Chart Rendering
- Every report the user has access to must display **bar charts that render correctly**
- Validate chart rendering across all accessible reports
- Use the existing HTML and open-source visualization libraries already in the prototype
- Flag any report where charts fail to render and fix before the 11:00 review

---

## 4. Persona Coverage

- All changes above must be confirmed working for **both personas**, not only the marketing director view
- Run a full walkthrough of each persona after implementation to verify consistent behavior

---

## Acceptance Checklist

Before the 11:00 cross-check with Mani, confirm the following:

- [ ] Talk screen header updated
- [ ] Frequently accessed cards include Dataset / Report pill label
- [ ] Frequently accessed items route to correct report or dataset (not conversational analytics)
- [ ] Frequently accessed items trigger access-request flow when user lacks permission
- [ ] Trending items follow the same routing logic
- [ ] Quick summary banners open a chart conversation view
- [ ] "Add to Report" action is available from the chart conversation view
- [ ] "Go to Source" action is available from the chart conversation view
- [ ] All accessible reports render bar charts correctly
- [ ] All changes validated across both personas

---

## Notification

Once all changes are live, send Lam the refreshed prototype link so he can review before the 11:00 session.

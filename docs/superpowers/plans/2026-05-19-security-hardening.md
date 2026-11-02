# NutriGoal Security Hardening & Architecture Improvement Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure the NutriGoal API by implementing authentication, fixing critical injection vulnerabilities, and improving general API robustness.

**Architecture:** Introduce a JWT-based authentication layer with role-based access control (RBAC). Implement strict input validation/sanitization for all MongoDB update operations.

**Tech Stack:** Node.js, Express, MongoDB, `jsonwebtoken`, `bcryptjs`, `express-rate-limit`.

---

## Chunk 1: P0 Critical Security Fixes

### Task 1: Implement Authentication Middleware & Admin Role
**Files:**
- Create: `backend/middleware/auth.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Install dependencies**
  Run: `npm install jsonwebtoken bcryptjs` in `/backend`
- [ ] **Step 2: Create `backend/middleware/auth.js`**
  Implement `authenticateToken` and `authorizeAdmin` middleware.
- [ ] **Step 3: Integrate middleware in `backend/app.js`**
  Export middleware and apply to protected routes.
- [ ] **Step 4: Commit**
  `git commit -m "sec: implement JWT authentication and admin authorization middleware"`

### Task 2: Fix NoSQL Injection in Student Routes
**Files:**
- Modify: `backend/routes/studentRoutes.js`

- [ ] **Step 1: Implement field allow-list for `POST /`**
  Replace `req.body` in `findOneAndUpdate` with a sanitized object.
- [ ] **Step 2: Verify fix**
  Test with a request body containing `$set` or `$rename` operators.
- [ ] **Step 3: Commit**
  `git commit -m "sec: fix NoSQL injection in student profile updates"`

### Task 3: Fix NoSQL Injection in Meal Routes
**Files:**
- Modify: `backend/routes/mealRoutes.js`

- [ ] **Step 1: Implement field allow-list for `POST /`**
- [ ] **Step 2: Implement field allow-list for `PUT /:id`**
- [ ] **Step 3: Verify fix**
- [ ] **Step 4: Commit**
  `git commit -m "sec: fix NoSQL injection in meal management routes"`

---

## Chunk 2: P1 High Priority Security

### Task 4: Implement Rate Limiting
**Files:**
- Modify: `backend/app.js`

- [ ] **Step 1: Install `express-rate-limit`**
- [ ] **Step 2: Configure global rate limiter in `app.js`**
- [ ] **Step 3: Commit**
  `git commit -m "sec: add global rate limiting to prevent DoS"`

---

## Chunk 3: P2/P3 Maintenance & Quality

### Task 5: Add Pagination to Lists
**Files:**
- Modify: `backend/routes/studentRoutes.js`
- Modify: `backend/routes/mealRoutes.js`

- [ ] **Step 1: Add pagination logic to `GET /api/meals`**
- [ ] **Step 2: Add pagination logic to `GET /api/students`**
- [ ] **Step 3: Commit**
  `git commit -m "perf: add pagination to meal and student list endpoints"`

### Task 6: Setup Testing Framework
**Files:**
- Modify: `backend/package.json`
- Create: `backend/tests/security.test.js`

- [ ] **Step 1: Install `jest` and `supertest`**
- [ ] **Step 2: Write tests for auth bypass and NoSQL injection**
- [ ] **Step 3: Run tests and verify they pass**
- [ ] **Step 4: Commit**
  `git commit -m "test: establish security testing suite"`

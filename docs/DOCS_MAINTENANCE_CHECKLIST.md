# KaffePOS Documentation Maintenance Checklist

**Version:** 1.0  
**Date:** 2026-05-14  
**Purpose:** Ensure documentation consistency and completeness

---

## 📚 Source of Truth Map

| Document | Purpose | Owner | Update Frequency |
|----------|---------|-------|------------------|
| **README.md** | Entry point, quick start, documentation index | Engineering | When structure changes |
| **docs/requirements/SRS.md** | System requirements, architecture, API specs, database schema, security rules | Engineering | When system changes |
| **docs/product/PRD.md** | Product vision, features, user stories, business rules | Product | When product changes |
| **docs/product/FEATURE_REGISTRY.md** | Feature status, modules, APIs, tables | Engineering | Every feature change |
| **docs/product/CHANGELOG_PRODUCT.md** | Product and documentation history | All | Every change |
| **docs/engineering/AI_AGENT_GUIDE.md** | AI agent rules, coding guidelines, documentation rules | Engineering | When rules change |
| **docs/engineering/SECURITY_HARDENING.md** | Security best practices, implementation guide | Security | When security changes |
| **docs/engineering/PERFORMANCE_GUIDE.md** | Performance optimization strategies | Engineering | When patterns change |
| **docs/architecture/BACKEND.md** | Backend architecture, patterns, conventions | Engineering | When architecture changes |
| **docs/affiliate-referral/** | Affiliate & referral system documentation | Product/Engineering | When feature changes |
| **docs/launch/** | Launch checklists, deployment guides | Operations | Before each release |
| **docs/operations/** | Operations, support, incident response | Operations | When processes change |
| **docs/testing/** | Testing guides, QA checklists | QA/Engineering | When testing changes |
| **docs/legal/** | Legal documents, policies | Legal/Product | When policies change |
| **docs/rfc/** | Request for Comments, major decisions | All | When proposing changes |

---

## ✅ Before Coding Checklist

**MANDATORY - Read these documents before making any code changes:**

### 1. Read Core Documentation
- [ ] **README.md** - Understand project structure and entry point
- [ ] **docs/requirements/SRS.md** - Understand system requirements and architecture
- [ ] **docs/product/PRD.md** - Understand product vision and business rules
- [ ] **docs/product/FEATURE_REGISTRY.md** - Check feature status and ownership
- [ ] **docs/engineering/AI_AGENT_GUIDE.md** - Understand coding rules and guidelines

### 2. Check Relevant Specialized Docs
- [ ] **docs/engineering/SECURITY_HARDENING.md** - If touching auth, payment, or sensitive data
- [ ] **docs/engineering/PERFORMANCE_GUIDE.md** - If touching queries, APIs, or frontend
- [ ] **docs/architecture/BACKEND.md** - If touching backend code
- [ ] **docs/affiliate-referral/** - If touching affiliate/referral features
- [ ] **docs/testing/QA_CHECKLIST.md** - Before production changes

### 3. Verify Current State
- [ ] Check if feature exists in FEATURE_REGISTRY.md
- [ ] Check if there's an open RFC for this change
- [ ] Check recent CHANGELOG_PRODUCT.md entries for context
- [ ] Verify no conflicting work in progress

### 4. Plan Documentation Updates
- [ ] Identify which docs will need updates
- [ ] Note any new rules or patterns to document
- [ ] Plan changelog entry

---

## ✅ After Coding Checklist

**MANDATORY - Update these documents after making code changes:**

### 1. Always Update
- [ ] **docs/product/CHANGELOG_PRODUCT.md** - Add entry under Added/Changed/Fixed/Docs

### 2. Update Based on Change Type (see matrix below)
- [ ] Update relevant source-of-truth documents
- [ ] Update FEATURE_REGISTRY.md if feature status changed
- [ ] Update AI_AGENT_GUIDE.md if new rules/patterns added

### 3. Verify Documentation
- [ ] All internal links work
- [ ] No conflicting information
- [ ] No duplicate content
- [ ] Clear and concise
- [ ] Examples included where helpful

### 4. Final Checks
- [ ] Documentation matches code behavior
- [ ] No secrets or sensitive data in docs
- [ ] Proper markdown formatting
- [ ] Spell check completed

---

## 📊 Documentation Update Matrix

Use this matrix to determine which documents to update based on your change type:

| Change Type | Required Documentation Updates |
|-------------|-------------------------------|
| **API Change** | • SRS.md (API section)<br>• FEATURE_REGISTRY.md<br>• CHANGELOG_PRODUCT.md<br>• Consider: architecture/BACKEND.md |
| **Database Change** | • SRS.md (Database section)<br>• FEATURE_REGISTRY.md (tables column)<br>• CHANGELOG_PRODUCT.md<br>• Migration file documented |
| **Product Behavior Change** | • PRD.md (if user-facing)<br>• SRS.md (if functional requirement)<br>• FEATURE_REGISTRY.md<br>• CHANGELOG_PRODUCT.md |
| **UI/UX Change** | • PRD.md (UX rules section)<br>• SRS.md (if functional)<br>• CHANGELOG_PRODUCT.md<br>• **Note:** Requires approval, no redesign |
| **Security Change** | • SRS.md (Security section)<br>• SECURITY_HARDENING.md<br>• AI_AGENT_GUIDE.md (if new rule)<br>• CHANGELOG_PRODUCT.md |
| **Performance Change** | • PERFORMANCE_GUIDE.md<br>• SRS.md (if architectural)<br>• CHANGELOG_PRODUCT.md |
| **Affiliate/Referral Change** | • PRD.md (Affiliate section)<br>• SRS.md (Business rules)<br>• affiliate-referral/ docs<br>• FEATURE_REGISTRY.md<br>• CHANGELOG_PRODUCT.md |
| **Payment Change** | • SRS.md (Payment section)<br>• SECURITY_HARDENING.md<br>• AI_AGENT_GUIDE.md (if rule change)<br>• CHANGELOG_PRODUCT.md |
| **Architecture Change** | • SRS.md (Architecture section)<br>• architecture/BACKEND.md<br>• AI_AGENT_GUIDE.md (if pattern change)<br>• CHANGELOG_PRODUCT.md<br>• Consider: RFC |
| **New Feature** | • PRD.md (if user-facing)<br>• SRS.md (functional requirements)<br>• FEATURE_REGISTRY.md (new row)<br>• CHANGELOG_PRODUCT.md |
| **Bug Fix** | • CHANGELOG_PRODUCT.md (Fixed section)<br>• Consider: SRS.md if requirement was wrong |
| **Documentation Only** | • CHANGELOG_PRODUCT.md (Docs section)<br>• Updated doc itself |
| **Test Addition** | • testing/ docs (if pattern change)<br>• CHANGELOG_PRODUCT.md |
| **Deployment Change** | • launch/DEPLOYMENT_GUIDE.md<br>• CHANGELOG_PRODUCT.md |
| **Operations Change** | • operations/ docs<br>• CHANGELOG_PRODUCT.md |

---

## 🚫 Common Mistakes to Avoid

### 1. Documentation Mistakes

❌ **Don't:**
- Skip reading docs before coding
- Forget to update CHANGELOG_PRODUCT.md
- Create undocumented features
- Duplicate rules across multiple docs
- Leave broken internal links
- Put secrets in documentation
- Create conflicting rules

✅ **Do:**
- Read all required docs before coding
- Always update changelog
- Document features before/during implementation
- Keep one source of truth per topic
- Verify all links work
- Use placeholders for secrets
- Resolve conflicts immediately

### 2. Code Mistakes

❌ **Don't:**
- Change UI/UX without approval
- Expose secrets in frontend
- Trust frontend payment callbacks
- Skip database migrations
- Create duplicate business logic
- Bypass security rules

✅ **Do:**
- Follow existing UI patterns
- Keep secrets backend-only
- Verify payments on backend
- Create migrations for schema changes
- Centralize business logic
- Follow security best practices

### 3. Process Mistakes

❌ **Don't:**
- Start coding without reading docs
- Make large changes without RFC
- Update code without updating docs
- Merge without documentation review
- Deploy without updating launch docs

✅ **Do:**
- Read docs first
- Create RFC for major changes
- Update docs with code
- Review documentation in PRs
- Update deployment docs before release

---

## 📋 Documentation Review Checklist

Use this checklist when reviewing documentation changes:

### Content Review
- [ ] Information is accurate and up-to-date
- [ ] No conflicting information with other docs
- [ ] No duplicate content (or properly linked)
- [ ] Clear and concise writing
- [ ] Proper grammar and spelling
- [ ] Examples are helpful and correct

### Structure Review
- [ ] Proper markdown formatting
- [ ] Consistent heading levels
- [ ] Tables formatted correctly
- [ ] Code blocks have language specified
- [ ] Lists are properly formatted

### Links Review
- [ ] All internal links work
- [ ] All external links work
- [ ] Links use relative paths for internal docs
- [ ] No broken references

### Security Review
- [ ] No secrets or credentials
- [ ] No sensitive PII
- [ ] No internal system details that shouldn't be public
- [ ] Security rules are clear and strict

### Completeness Review
- [ ] All required sections present
- [ ] CHANGELOG_PRODUCT.md updated
- [ ] FEATURE_REGISTRY.md updated if needed
- [ ] Cross-references to related docs

---

## 🔄 Documentation Maintenance Schedule

### Daily
- [ ] Update CHANGELOG_PRODUCT.md for any changes
- [ ] Update FEATURE_REGISTRY.md for feature status changes

### Weekly
- [ ] Review open documentation issues
- [ ] Check for broken links
- [ ] Review recent changelog entries

### Monthly
- [ ] Review all documentation for accuracy
- [ ] Update outdated examples
- [ ] Archive obsolete documentation
- [ ] Check for duplicate content

### Quarterly
- [ ] Full documentation audit
- [ ] Update architecture diagrams if needed
- [ ] Review and update all checklists
- [ ] Update README.md if structure changed

### Before Each Release
- [ ] Review launch/ documentation
- [ ] Update deployment guides
- [ ] Verify all checklists are current
- [ ] Update version numbers where applicable

---

## 🎯 Documentation Quality Standards

### Writing Standards
- **Clarity:** Use simple, direct language
- **Conciseness:** Be brief but complete
- **Consistency:** Follow existing patterns
- **Correctness:** Verify all information
- **Completeness:** Cover all necessary details

### Formatting Standards
- **Headings:** Use proper hierarchy (H1 > H2 > H3)
- **Lists:** Use bullets for unordered, numbers for ordered
- **Code:** Use code blocks with language specification
- **Tables:** Use for structured data
- **Links:** Use descriptive link text

### Content Standards
- **Accuracy:** All information must be correct
- **Currency:** Keep documentation up-to-date
- **Relevance:** Remove outdated information
- **Searchability:** Use clear, searchable terms
- **Accessibility:** Write for all skill levels

---

## 🚨 Critical Documentation Rules

### NEVER
1. ❌ Change UI/UX without explicit approval and PRD/RFC update
2. ❌ Document secrets, credentials, or sensitive data
3. ❌ Trust frontend payment callbacks (backend verification only)
4. ❌ Skip database migrations when schema changes
5. ❌ Create undocumented features
6. ❌ Duplicate business logic documentation
7. ❌ Leave conflicting rules across documents
8. ❌ Break internal documentation links

### ALWAYS
1. ✅ Read required docs before coding
2. ✅ Update CHANGELOG_PRODUCT.md after every change
3. ✅ Keep one source of truth per topic
4. ✅ Verify backend-only payment verification
5. ✅ Document database migrations
6. ✅ Update FEATURE_REGISTRY.md for feature changes
7. ✅ Resolve documentation conflicts immediately
8. ✅ Test all documentation links

---

## 📞 Documentation Help

### Questions About Documentation?

1. **Which doc to update?** → Check Documentation Update Matrix above
2. **How to write good docs?** → Follow Documentation Quality Standards
3. **Found conflicting rules?** → Report immediately, resolve with team
4. **Found broken links?** → Fix immediately and update changelog
5. **Need to propose major change?** → Create RFC in docs/rfc/

### Documentation Issues

- **Broken links:** Fix immediately
- **Conflicting rules:** Escalate to team lead
- **Missing documentation:** Create issue, document ASAP
- **Outdated information:** Update and note in changelog
- **Duplicate content:** Consolidate to one source of truth

---

## ✅ Quick Reference

### Before Coding
```
1. Read: README.md
2. Read: SRS.md
3. Read: PRD.md
4. Read: FEATURE_REGISTRY.md
5. Read: AI_AGENT_GUIDE.md
6. Check: Relevant specialized docs
7. Plan: Documentation updates
```

### After Coding
```
1. Update: CHANGELOG_PRODUCT.md (always)
2. Update: Relevant docs per matrix
3. Update: FEATURE_REGISTRY.md (if needed)
4. Verify: Links work
5. Verify: No conflicts
6. Verify: No duplicates
```

### Documentation Hierarchy
```
README.md (entry point)
├── docs/requirements/SRS.md (system truth)
├── docs/product/PRD.md (product truth)
├── docs/product/FEATURE_REGISTRY.md (feature status)
├── docs/product/CHANGELOG_PRODUCT.md (history)
└── docs/engineering/AI_AGENT_GUIDE.md (rules)
```

---

**Last Updated:** 2026-05-14  
**Maintained By:** Engineering Team  
**Review Frequency:** Quarterly


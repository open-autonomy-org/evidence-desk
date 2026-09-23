# Incident response policy

<!-- Template adapted from the Tailscale security policies (CC0-1.0), https://github.com/tailscale/security-policies. Adapt it to how {{organization}} actually operates before approving it. -->

### Purpose

{{organization}}’s customers are dependent on our services operating as normal. Proper detection and response to incidents that may impact the integrity, confidentiality or availability of services and data is critical to the operation of {{organization}}.

### Scope

The following minimum standards apply to {{organization}}’s assets as managed by employees, contractors and vendors. These recommendations represent the recommended minimum efforts necessary for incident detection and response.

### Policy

#### Incident detection

An incident could be detected by automated alerting, internally by an employee in their course of work, by an employee or vendor doing a review of {{organization}}’s security posture, or an external third party reporting a potential vulnerability to us.

If you see something, say something. All {{organization}} employees must immediately report suspected security incidents or suspicious activity that occurs at {{organization}}, including but not limited to security incidents, physical injury, theft, property damage, denial of service attacks, threats, harassment, abuse of individual user accounts, forgery and misrepresentation. Suspicious activity can be reported to the Slack channel #incident-response, or, for potentially sensitive incidents, to the Security Review Team or to the security owner. Violations of the [Code of Conduct](http://go/code-of-conduct) must be reported to the security owner.

All employees much watch for potentially suspicious activities, including:

* Warnings from antivirus tools
* Unexpected system reboots and/or sudden degradation of system performance
* Password reset notifications
* Modification or defacement of websites
* New open network ports on a system
* Multi-factor authentication prompts

{{organization}} regularly reviews logs to detect and track attempted intrusions and other suspicious activity. These include git, cloud, networking, SaaS tools, and other infrastructure logs.

The Security Review Team:

* Ensures that a very high level of logging is enabled
* Checks logs regularly for suspicious activities and entries
* Looks for missing time spans in logs
* Checks for repeated login failures or account lockouts
* Investigates unexpected system reboots

{{organization}}’s Security Review Team reviews and responds to potential third-party reports of security issues to {{security_contact}} promptly.

### Incident response and remediation

If a suspected incident is detected, it must be responded to following the incident response policy.

We respond to reported incidents, and resolve and determine impact as soon as possible. We aim to remediate incidents as soon as possible.

Confirmed incidents may be disclosed publicly per our incident response policy.

### Roles and responsibilities
{{organization}}’s Security Review team is responsible for handling potential security incidents. The Security team is responsible for reviewing and updating this policy  on an annual basis.

### Purpose

{{organization}}’s customers are dependent on our services operating as normal. Proper detection and response to incidents that may impact the integrity, confidentiality or availability of services and data is critical to the operation of {{organization}}.

### Scope

The following minimum standards apply to {{organization}}’s assets as managed by employees, contractors and vendors. These recommendations represent the recommended minimum efforts necessary for incident detection and response.


### Policy

#### Incident response

When a suspected incident is reported, it is first investigated by the eng-primary
oncall. If it is suspected to be an incident, they must declare an incident,
and identify the Incident Commander in the incident channel. Information from an incident must be kept confidential. The Incident Commander is responsible for:

* If an incident is likely to require ongoing response and remediation efforts,
  opening an incident record to track updates to
  the incident and a shared working document for collaborative work.
* Classifying the severity of the incident, including scope and the risk of any
  assets which may be affected. This can be further updated as information
  changes, and may inform how we choose to react. Depending on the urgency of
  the incident, this may be done after the fact.
* Contacting vendors or coordinating to contact vendors, to validate if their
  product may be compromised.
* Appointing roles, including a communications lead, if needed.
* Ensuring handoff between team members, for example, at the end of a work day.
* Escalating to leadership if responses are insufficient.

In addition to remediating the incident, {{organization}} employees must also seek
to put into place any corrective actions possible to lessen the impact of an
incident.

If an incident affects customers, including their data or their ability to use
{{organization}}, {{organization}} may choose to proactively communicate the issue publicly.

#### Incident recovery

If data or processes were disrupted by the incident, then the business continuity policy
must be followed to remediate the issue.

Once an incident is mitigated or otherwise closed, it is the Incident
Commander’s responsibility to ensure that

* The resolution is communicated to all affected parties, including external
  customers, if applicable.
* For incidents causing a production outage or loss of customer or other
  critical data, a post-mortem is completed. This should include: details of
  the incident, timeline of the incident, its impact, the actions taken to
  mitigate or resolve it, the root cause(s), and the follow-up actions to
  prevent the incident from recurring. Where applicable, some version of the
  post-mortem may be shared with external affected parties. Newly identified
  risks must be added to the risk register.

#### Incident classification

An incident is an adverse event which affects {{organization}}’s infrastructure or
business operations in such a way that it compromises our ability to deliver
the service customers expect. A vulnerability is not necessarily an incident;
for example, a vulnerability not being actively exploited may require action,
but not expedited action beyond existing vulnerability remediation processes.

Incidents can be classified based on their severity:

<table>
  <tr>
    <td>Critical</td>
    <td>
    Extreme or complete production outage, significantly degraded experience
    for >50% of {{organization}} users, or customer or other critical data loss or
    corruption.
    </td>
  </tr>
  <tr>
    <td>High</td>
    <td>
    Partial outage of some production functionality or in some regions,
    degraded experience for multiple customers with no workaround available, or
    suspected severe security breach.
    </td>
  </tr>
  <tr>
    <td>Medium</td>
    <td>
    Non-critical functionality loss or degradation for some customers, with
    possible short-term workaround, or detection of unauthorized activity.
    </td>
  </tr>
  <tr>
    <td>Low</td>
    <td>
    No current or known customer impact.
    </td>
  </tr>
</table>

### Roles and responsibilities

{{organization}}’s Security team is responsible for reviewing and updating the incident response process on an annual basis.

### Purpose

This policy specifies when and how we notify users about security incidents.

### Scope

Both the client software and our managed backend infrastructure (i.e. coordination server) are in scope for this policy.

### Policy

For incidents that fall under any legal disclosure requirements (such as [California’s Data Security Breach Reporting](https://oag.ca.gov/privacy/databreach/reporting)), those requirements will take precedence over this policy.

By “notify” here we mean explicitly contacting users in addition to regular release notes in the product changelog and commit history. For example, you may read about minor vulnerability patches in release notes, but we may not notify users via a dedicated security bulletin.

#### When we notify users

Generally, we aim to reduce noise and only notify users for actionable incidents. {{organization}} does not notify users for routine security patching of dependencies. We also don’t notify users for vulnerabilities in our software, if we confirm the vulnerability was not exploited and no users were affected.

We will **disclose** a security vulnerability **when a fix is available** and any of the following is true:

* User action is needed to fix the vulnerability, e.g. updating the client software, or applying another mitigation;
* We can confirm that customer metadata or data was visible to an unauthorized party; or
* We cannot confirm that no users were affected by the vulnerability.

We will **notify users directly** about a security vulnerability when we can confirm that the customer's account was affected, and any of the following is true:

* User action is needed to fix the vulnerability, and it is a critical or high impact vulnerability; or
* We can confirm that customer metadata or data was visible to an unauthorized party.

### How we notify users

To disclose security vulnerabilities, {{organization}} publishes security bulletins publicly for a broad audience on its security page. These can be consumed directly, via RSS readers or via social media bot accounts.

To notify users about security vulnerabilities, {{organization}} will **email** affected customers’ administrators, with information specific to the customer's account, including the specific users or resources affected. These emails will be sent to the security contact the customer designated, which by default is the Owner of the customer's account.

Occasionally, {{organization}} may decide to notify users in additional ways about a security issue, such as by publishing a blog post, or with in-product notifications (such as by putting a warning banner in the admin console).

### Roles and responsibilities

{{organization}}’s Security Review team is responsible for sending notifications for incidents. The Security team is responsible for reviewing and updating this policy  on an annual basis.

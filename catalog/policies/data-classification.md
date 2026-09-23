# Data classification policy

<!-- Template adapted from the Tailscale security policies (CC0-1.0), https://github.com/tailscale/security-policies. Adapt it to how {{organization}} actually operates before approving it. -->

### Purpose

To understand its potential exposure from a security risk, issue or incident, {{organization}} regularly catalogues and classifies its data and other in-scope assets, in order to apply risk-based controls.

### Scope

Applicable assets include, but not limited to, customer data, production data, financial data, intellectual property, and any material non-public information.

### Policy

#### Asset cataloging

{{organization}} catalogues assets with several pieces of information, to help identify the potential risk of the asset. Information collected is as follows:

* **Description**, i.e. what is the asset?
* **Risk**, i.e. what is the asset risk classification?
* **Use**, i.e. how is this asset used?
* **Location,** i.e. where is it stored, used, and backed up?
* **Sharing**, i.e. is it shared with any third parties, such as vendors? Which specific third parties?

If new data is catalogued, or data use changes, it should be specifically reviewed to verify that its collection and use is in line with privacy policy.


### Asset risk classification

{{organization}} classifies assets into three risk categories: **Low Risk**, **Medium Risk**, and **High Risk**. Definitions are as follows:

<table>
  <tr>
   <td><strong>Risk category</strong>
   </td>
   <td><strong>Definition</strong>
   </td>
  </tr>
  <tr>
   <td><strong>High risk</strong>
   </td>
   <td>
<ul>
<li><strong>Data</strong>: protection is mandated by confidentiality agreements, labor codes, specific laws and regulations (e.g. PCI DSS, HIPAA, GDPR), or data is subject to breach reporting requirements, or disclosure would have a significant adverse impact on {{organization}} (e.g., user accounts database).

<li><strong>Hardware and software systems</strong>: compromise would have a significant adverse impact on {{organization}} (e.g. the production service customers sign in to).
</li>
</ul>
   </td>
  </tr>
  <tr>
   <td><strong>Medium risk</strong>
   </td>
   <td>
<ul>
<li><strong>Data</strong>: not generally available to the public, and disclosure would have some adverse impact on {{organization}} (e.g. internal engineering documentation).

<li><strong>Hardware and software systems</strong>: compromise would have some adverse impact on {{organization}} (e.g. cloud VM running production monitoring system).
</li>
</ul>
   </td>
  </tr>
  <tr>
   <td><strong>Low risk</strong>
   </td>
   <td>
<ul>
<li><strong>Data</strong>: publicly available, or disclosure would have no adverse operational or financial impact on {{organization}} (e.g. the public website's source code). May still have some limited reputational impact.

<li><strong>Hardware and software systems</strong>: compromise would have no adverse impact on {{organization}} (e.g. testbed cloud VM with no user data or privileged access).
</li>
</ul>
   </td>
  </tr>
</table>

When multiple classifications may apply, the highest applicable classification is used. For example, if a machine is low-risk by itself, but can be used to access high-risk data, its overall classification is also high-risk. Any unlabeled assets will be considered confidential with the risk category of High by default.


### Roles and responsibilities

{{organization}}’s Security team is responsible for reviewing and updating data assets on an annual basis.

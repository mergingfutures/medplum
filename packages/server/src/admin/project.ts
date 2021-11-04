import { assertOk, Bundle, BundleEntry, getStatus, Operator, Project, ProjectMembership, Reference } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { repo } from '../fhir';
import { authenticateToken } from '../oauth';
import { inviteHandler, inviteValidators } from './invite';
import { verifyProjectAdmin } from './utils';

export const projectAdminRouter = Router();
projectAdminRouter.use(authenticateToken);
projectAdminRouter.post('/:projectId/invite', inviteValidators, asyncWrap(inviteHandler));

projectAdminRouter.get('/', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, bundle] = await repo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{
      code: 'user',
      operator: Operator.EQUALS,
      value: 'User/' + res.locals.user
    }]
  });
  assertOk(outcome);

  const memberships = ((bundle as Bundle<ProjectMembership>).entry as BundleEntry<ProjectMembership>[])
    .map(entry => entry.resource as ProjectMembership)
    .filter(membership => membership.admin);

  const projects = [];
  for (const membership of memberships) {
    const [projectOutcome, project] = await repo.readReference(membership.project as Reference<Project>)
    assertOk(projectOutcome);
    projects.push({
      id: project?.id,
      name: project?.name
    });
  }

  res.status(200).json({ projects });
}));

projectAdminRouter.get('/:projectId', asyncWrap(async (req: Request, res: Response) => {
  const projectDetails = await verifyProjectAdmin(req, res);
  if (!projectDetails) {
    return res.sendStatus(404);
  }

  const { project, memberships } = projectDetails;
  const members = [];
  for (const membership of memberships) {
    members.push({
      membershipId: membership.id,
      profile: membership.profile?.reference,
      user: membership.user?.reference,
      name: membership.profile?.display
    });
  }

  return res.status(200).json({
    project: {
      id: project?.id,
      name: project?.name
    },
    members
  });
}));

projectAdminRouter.get('/:projectId/members/:membershipId', asyncWrap(async (req: Request, res: Response) => {
  const projectDetails = await verifyProjectAdmin(req, res);
  if (!projectDetails) {
    res.sendStatus(404);
    return;
  }

  const { membershipId } = req.params;
  const [outcome, membership] = await repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(membership);
}));

projectAdminRouter.post('/:projectId/members/:membershipId', asyncWrap(async (req: Request, res: Response) => {
  const projectDetails = await verifyProjectAdmin(req, res);
  if (!projectDetails) {
    res.sendStatus(404);
    return;
  }

  const resource = req.body;
  const [outcome, result] = await repo.updateResource(resource);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(result);
}));
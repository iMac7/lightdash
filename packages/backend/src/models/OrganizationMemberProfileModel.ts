import {
    NotFoundError,
    OrganizationMemberProfile,
    OrganizationMemberProfileUpdate,
    OrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
} from '@lightdash/common';
import { Knex } from 'knex';
import { EmailTableName } from '../database/entities/emails';
import { GroupTableName } from '../database/entities/groups';
import { GroupMembershipTableName } from '../database/entities/group_memberships';
import { InviteLinkTableName } from '../database/entities/inviteLinks';
import {
    DbOrganizationMembership,
    DbOrganizationMembershipIn,
    OrganizationMembershipsTableName,
} from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbUser, UserTableName } from '../database/entities/users';

type DbOrganizationMemberProfile = {
    user_uuid: string;
    first_name: string;
    last_name: string;
    is_active: boolean;
    email: string;
    organization_uuid: string;
    role: OrganizationMemberRole;
    expires_at?: Date;
};

const SelectColumns = [
    `${UserTableName}.user_uuid`,
    `${UserTableName}.user_id`,
    `${UserTableName}.first_name`,
    `${UserTableName}.last_name`,
    `${UserTableName}.is_active`,
    `${EmailTableName}.email`,
    `${OrganizationTableName}.organization_uuid`,
    `${OrganizationMembershipsTableName}.role`,
    `${InviteLinkTableName}.expires_at`,
];

export class OrganizationMemberProfileModel {
    private readonly database: Knex;

    private readonly queryBuilder: () => Knex.QueryBuilder<
        DbOrganizationMemberProfile[]
    >;

    constructor({ database }: { database: Knex }) {
        this.database = database;
        this.queryBuilder = () =>
            database(OrganizationMembershipsTableName)
                .innerJoin(
                    UserTableName,
                    `${OrganizationMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .joinRaw(
                    `INNER JOIN ${EmailTableName} ON ${UserTableName}.user_id = ${EmailTableName}.user_id AND ${EmailTableName}.is_primary`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationMembershipsTableName}.organization_id`,
                    `${OrganizationTableName}.organization_id`,
                )
                .leftJoin(
                    InviteLinkTableName,
                    `${UserTableName}.user_uuid`,
                    `${InviteLinkTableName}.user_uuid`,
                );
    }

    private static parseRow(
        member: DbOrganizationMemberProfile,
    ): OrganizationMemberProfile {
        return {
            userUuid: member.user_uuid,
            firstName: member.first_name,
            lastName: member.last_name,
            email: member.email,
            organizationUuid: member.organization_uuid,
            role: member.role,
            isActive: member.is_active,
            isInviteExpired:
                !member.is_active &&
                (!member.expires_at || member.expires_at < new Date()),
        };
    }

    async findOrganizationMember(
        organizationUuid: string,
        userUuid: string,
    ): Promise<OrganizationMemberProfile | undefined> {
        const [member] = await this.queryBuilder()
            .where(`${UserTableName}.user_uuid`, userUuid)
            .andWhere(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(SelectColumns);

        return member && OrganizationMemberProfileModel.parseRow(member);
    }

    async getOrganizationMembers(
        organizationUuid: string,
    ): Promise<OrganizationMemberProfile[]> {
        const members = await this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbOrganizationMemberProfile[]>(SelectColumns);
        return members.map(OrganizationMemberProfileModel.parseRow);
    }

    async getOrganizationMembersAndGroups(
        organizationUuid: string,
        includeGroups?: number,
    ): Promise<OrganizationMemberProfileWithGroups[]> {
        let orgMembersAndGroupsQuery = this.database(UserTableName)
            .leftJoin(
                OrganizationMembershipsTableName,
                `${UserTableName}.user_id`,
                `${OrganizationMembershipsTableName}.user_id`,
            )
            .leftJoin(
                OrganizationTableName,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .leftJoin(
                GroupMembershipTableName,
                `${UserTableName}.user_id`,
                `${GroupMembershipTableName}.user_id`,
            )
            .leftJoin(
                GroupTableName,
                `${GroupMembershipTableName}.group_uuid`,
                `${GroupTableName}.group_uuid`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .joinRaw(
                `INNER JOIN ${EmailTableName} ON ${UserTableName}.user_id = ${EmailTableName}.user_id AND ${EmailTableName}.is_primary`,
            )
            .leftJoin(
                InviteLinkTableName,
                `${UserTableName}.user_uuid`,
                `${InviteLinkTableName}.user_uuid`,
            )
            .groupBy(
                `${UserTableName}.user_uuid`,
                `${UserTableName}.user_id`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${UserTableName}.is_active`,
                `${EmailTableName}.email`,
                `${OrganizationTableName}.organization_uuid`,
                `${OrganizationMembershipsTableName}.role`,
                `${InviteLinkTableName}.expires_at`,
            )
            .select(
                `${UserTableName}.user_uuid`,
                `${UserTableName}.user_id`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${UserTableName}.is_active`,
                `${EmailTableName}.email`,
                `${OrganizationTableName}.organization_uuid`,
                `${OrganizationMembershipsTableName}.role`,
                `${InviteLinkTableName}.expires_at`,
            )
            .select(
                this.database.raw(
                    `ARRAY_AGG(DISTINCT ${GroupTableName}.group_uuid) FILTER (WHERE ${GroupTableName}.group_uuid IS NOT NULL) as group_uuids`,
                ),
                this.database.raw(
                    `ARRAY_AGG(DISTINCT ${GroupTableName}.name) FILTER (WHERE ${GroupTableName}.name IS NOT NULL) as group_names`,
                ),
            );

        if (includeGroups !== undefined) {
            orgMembersAndGroupsQuery =
                orgMembersAndGroupsQuery.limit(includeGroups);
        }

        const result: (DbOrganizationMemberProfile & {
            group_uuids: string[];
            group_names: string[];
            groups: { name: string; uuid: string }[];
        })[] = await orgMembersAndGroupsQuery;

        const updatedMembers = result.map((row) => ({
            ...row,
            groups:
                !row.group_uuids && !row.group_names
                    ? []
                    : row.group_uuids.map((groupUuid, index) => ({
                          uuid: groupUuid,
                          name: row.group_names[index],
                      })),
        }));

        return updatedMembers.map((m) => ({
            ...OrganizationMemberProfileModel.parseRow(m),
            groups: m.groups,
        }));
    }

    async getOrganizationAdmins(
        organizationUuid: string,
    ): Promise<OrganizationMemberProfile[]> {
        const members = await this.queryBuilder()
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .andWhere('role', 'admin')
            .select<DbOrganizationMemberProfile[]>(SelectColumns);
        return members.map(OrganizationMemberProfileModel.parseRow);
    }

    createOrganizationMembership = async (
        membershipIn: DbOrganizationMembershipIn,
    ) => {
        await this.database<DbOrganizationMembership>(
            'organization_memberships',
        ).insert<DbOrganizationMembershipIn>(membershipIn);
    };

    async getOrganizationMemberByUuid(
        organizationUuid: string,
        userUuid: string,
    ): Promise<OrganizationMemberProfile> {
        const member = await this.findOrganizationMember(
            organizationUuid,
            userUuid,
        );
        if (!member) {
            throw new NotFoundError('No matching member found in organization');
        }
        return member;
    }

    async updateOrganizationMember(
        organizationUuid: string,
        userUuid: string,
        data: OrganizationMemberProfileUpdate,
    ): Promise<OrganizationMemberProfile> {
        if (data.role) {
            const sqlParams = {
                organizationUuid,
                userUuid,
                role: data.role,
            };
            await this.database.raw<
                (DbOrganizationMemberProfile & DbOrganization & DbUser)[]
            >(
                `
                    UPDATE organization_memberships AS m
                    SET role = :role FROM organizations AS o, users AS u
                    WHERE o.organization_id = m.organization_id
                      AND u.user_id = m.user_id
                      AND user_uuid = :userUuid
                      AND organization_uuid = :organizationUuid
                        RETURNING *
                `,
                sqlParams,
            );
        }
        return this.getOrganizationMemberByUuid(organizationUuid, userUuid);
    }
}

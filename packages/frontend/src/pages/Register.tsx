import {
    ApiError,
    CreateUserArgs,
    LightdashUser,
    OpenIdIdentityIssuerType,
} from '@lightdash/common';
import { Anchor, Card, Image, Stack, Text, Title } from '@mantine/core';
import { FC } from 'react';
import { useMutation } from 'react-query';
import { useLocation } from 'react-router-dom';
import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import useToaster from '../hooks/toaster/useToaster';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { Divider, DividerWrapper } from './Invite.styles';

const registerQuery = async (data: CreateUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health } = useApp();
    const { showToastError } = useToaster();
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    const { identify } = useTracking();
    const redirectUrl = location.state?.from
        ? `${location.state.from.pathname}${location.state.from.search}`
        : '/';
    const { isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        CreateUserArgs
    >(registerQuery, {
        mutationKey: ['login'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = redirectUrl;
        },
        onError: (error) => {
            showToastError({
                title: `Failed to create user`,
                subtitle: error.error.message,
            });
        },
    });

    if (health.isLoading) {
        return <PageSpinner />;
    }

    const ssoAvailable =
        health.data?.auth.google.enabled ||
        health.data?.auth.okta.enabled ||
        health.data?.auth.oneLogin.enabled ||
        health.data?.auth.azuread.enabled;
    const ssoLogins = ssoAvailable && (
        <Stack>
            {Object.values(OpenIdIdentityIssuerType).map((providerName) => (
                <ThirdPartySignInButton
                    key={providerName}
                    providerName={providerName}
                    intent="signup"
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );
    const passwordLogin = allowPasswordAuthentication && (
        <CreateUserForm
            minimal={minimal}
            isLoading={isLoading || isSuccess}
            onSubmit={(data: CreateUserArgs) => {
                mutate(data);
            }}
        />
    );
    const logins = (
        <>
            {ssoLogins}
            {ssoLogins && passwordLogin && (
                <DividerWrapper>
                    <Divider />
                    <b>OR</b>
                    <Divider />
                </DividerWrapper>
            )}
            {passwordLogin}
        </>
    );
    const stackContent = (
        <>
            <Image
                src={LightdashLogo}
                alt="lightdash logo"
                width={130}
                mx="auto"
                my="lg"
            />
            <Card p="xl" radius="xs" withBorder shadow="xs">
                <Title order={3} ta="center" mb="md">
                    Sign up
                </Title>
                {logins}
            </Card>
            <Text color="gray.6" ta="center">
                By creating an account, you agree to
                <br />
                our{' '}
                <Anchor
                    href="https://www.lightdash.com/privacy-policy"
                    target="_blank"
                >
                    Privacy Policy
                </Anchor>{' '}
                and our{' '}
                <Anchor
                    href="https://www.lightdash.com/terms-of-service"
                    target="_blank"
                >
                    Terms of Service.
                </Anchor>
            </Text>
        </>
    );

    return minimal ? (
        <Stack m="xl">{stackContent}</Stack>
    ) : (
        <Page title="Register" withCenteredContent withNavbar={false}>
            <Stack w={400} mt="4xl">
                {stackContent}
            </Stack>
        </Page>
    );
};

export default Register;

import { aws, helpers } from "@breeze32/shared-infra";
import * as pulumi from "@pulumi/pulumi";

const awsConfig = new pulumi.Config("aws");
const awsRegion = awsConfig.require("region");

const config = new pulumi.Config();
const environment = config.require("environment");

const productName = "main-app";

const vpcStackRef = helpers.getStackRef({
	environment,
	name: "vpc",
	region: awsRegion,
	productName: "main-app",
});
const vpcId = vpcStackRef.getOutput("vpcId");
// const privateSubnetIds = vpcStackRef.getOutput("privateSubnetIds");

const clusterRef = new pulumi.StackReference(
	`simon-norman/main-app-eu-west-2-ec2-cluster/${environment}`,
);
const clusterArn = clusterRef.getOutput("arn");

const loadBalancerRef = helpers.getStackRef({
	environment,
	name: "public-load-balancer",
	region: awsRegion,
	productName: "main-app",
});
const loadBalancerArn = loadBalancerRef.getOutput("arn");
const loadBalancerDnsName = loadBalancerRef.getOutput("dnsName");
const listenerArn = loadBalancerRef.getOutput("listenerArn");

const envHostedZoneRef = helpers.getStackRef({
	environment,
	name: "environment-hosted-zone",
	region: awsRegion,
	productName,
});
const environmentHostedZoneId = envHostedZoneRef.getOutput("zoneId");

const httpsCertificateRef = helpers.getStackRef({
	environment,
	name: "https-certificate",
	region: awsRegion,
	productName,
});
const httpsCertificateArn = httpsCertificateRef.getOutput("arn");

const securityGroupsRef = helpers.getStackRef({
	environment,
	name: "security-groups",
	region: awsRegion,
	productName,
});
const securityGroup = securityGroupsRef.getOutput(
	"inboundAlbSecurityGroupOutboundAll",
);

const dbStackRef = helpers.getStackRef({
	environment,
	name: "locations-db",
	region: awsRegion,
	productName,
});
const dbRoleNames = dbStackRef.getOutput("dbRoleNames");

const expectedRoleName = `${environment}-${awsRegion}-role-locations-api`;

const roleName = dbRoleNames.apply((names) =>
	names.find((name: string) => name === expectedRoleName),
);

const dbInstanceId = dbStackRef.getOutput("dbInstanceId");

new aws.PublicFargateService({
	region: awsRegion,
	name: "locations-api",
	environment,
	vpcId,
	clusterArn,
	loadBalancerArn,
	listenerArn,
	servicePort: 3000,
	serviceDockerfileTarget: "release_locations_api",
	environmentHostedZoneId,
	loadBalancerDnsName,
	serviceDockerfilePath: "../../monorepo/Dockerfile",
	serviceDockerContext: "../../monorepo",
	httpsCertificateArn,
	networkConfig: {
		type: aws.FargateNetworkType.public,
		// subnets: [
		//   privateSubnetIds.apply((ids) => ids[0]),
		//   privateSubnetIds.apply((ids) => ids[1]),
		// ],
		// securityGroups: [securityGroup.apply((group) => group.id)],
	},
	db: {
		dbRoleName: roleName,
		awsDbInstanceId: dbInstanceId,
	},
});

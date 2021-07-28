import * as codepipeline from "@aws-cdk/aws-codepipeline";
import * as codepipelineactions from "@aws-cdk/aws-codepipeline-actions";
import * as cdk from "@aws-cdk/core";
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';

export class PipelineStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const sourceArtifact = new codepipeline.Artifact();
        const cloudAssemblyArtifact = new codepipeline.Artifact();

        const pipeline = new CdkPipeline(this, 'Pipeline', {
            pipelineName: 'EcommercePipeline',
            cloudAssemblyArtifact: cloudAssemblyArtifact,

            sourceAction: new codepipelineactions.GitHubSourceAction({
                actionName: 'GitHub',
                output: sourceArtifact,
                oauthToken: cdk.SecretValue.secretsManager('github-token-pipeline'),
                owner: 'adrianosastre',
                repo: 'EcommerceCDK',
                branch: 'master',
            }), //pegar o código fonte

            synthAction: SimpleSynthAction.standardNpmSynth({
                sourceArtifact: sourceArtifact,
                cloudAssemblyArtifact: cloudAssemblyArtifact,
                // installCommand: 'npx npm@7 install ...' // npm version 7 in machine
                installCommand: 'npx npm@6 install && npm install -g typescript && npm install -g aws-cdk',
                buildCommand: 'npm run build',
                environment: {
                    privileged: true, // necessário para executar o docker no processo de build
                }
            }), // gerar o código fonte (compilar)

            // TODO add pipeline stages
        });
    }
}
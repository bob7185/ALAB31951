import express from "express";
import db from "../db/conn.mjs";
import { ObjectId } from "mongodb";

const router = express.Router();

/**
 * It is not best practice to seperate these routes
 * like we have done here. This file was created
 * specifically for educational purposes, to contain
 * all aggregation routes in one place.
 */

/**
 * Grading Weights by Score Type:
 * - Exams: 50%
 * - Quizes: 30%
 * - Homework: 20%
 */

// Get the weighted average of a specified learner's grades, per class
router.get("/learner/:id/avg-class", async (req, res) => {
  let collection = await db.collection("grades");

  let result = await collection
    .aggregate([
      {
        $match: { learner_id: Number(req.params.id) },
      },
      {
        $unwind: { path: "$scores" },
      },
      {
        $group: {
          _id: "$class_id",
          quiz: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "quiz"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          exam: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "exam"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          homework: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "homework"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          class_id: "$_id",
          avg: {
            $sum: [
              { $multiply: [{ $avg: "$exam" }, 0.5] },
              { $multiply: [{ $avg: "$quiz" }, 0.3] },
              { $multiply: [{ $avg: "$homework" }, 0.2] },
            ],
          },
        },
      },
    ])
    .toArray();

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

router.get("/stats", async (req, res) => {
  const collection = await db.collection("grades");
  const result = await collection
    .aggregate([
      // Step 1: Calculate total learners
      {
        $facet: {
          totalLearners: [{ $count: "count" }],
          // Step 2: Calculate learners with weighted average > 70
          learnersAbove70: [
            { $unwind: "$scores" },
            {
              $addFields: {
                weightedScore: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$scores.type", "exam"] }, then: { $multiply: ["$scores.score", 0.5] } },
                      { case: { $eq: ["$scores.type", "quiz"] }, then: { $multiply: ["$scores.score", 0.3] } },
                      { case: { $eq: ["$scores.type", "homework"] }, then: { $multiply: ["$scores.score", 0.2] } },
                    ],
                    default: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: "$learner_id",
                weightedAverage: { $sum: "$weightedScore" },
              },
            },
            { $match: { weightedAverage: { $gt: 70 } } },
            { $count: "count" },
          ],
        },
      },
      // Step 3: Merge results and calculate percentage
      {
        $project: {
          totalLearners: { $arrayElemAt: ["$totalLearners.count", 0] },
          learnersAbove70: { $arrayElemAt: ["$learnersAbove70.count", 0] },
        },
      },
      {
        $addFields: {
          percentageAbove70: {
            $multiply: [
              { $divide: ["$learnersAbove70", "$totalLearners"] },
              100,
            ],
          },
        },
      },
    ])
    .toArray();

  res.send(result[0]);
});

router.get("/stats/:id", async (req, res) => {
  const classId = Number(req.params.id);  
  const collection = await db.collection("grades");

  const result = await collection
    .aggregate([
      // Step 1: Match the specific class by class_id
      { $match: { class_id: classId } },

      {
        $facet: {
          totalLearners: [{ $count: "count" }],  // Count total learners in the class
          learnersAbove70: [
            { $unwind: "$scores" },  // Unwind the scores to calculate weighted average
            {
              $addFields: {
                weightedScore: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$scores.type", "exam"] }, then: { $multiply: ["$scores.score", 0.5] } },
                      { case: { $eq: ["$scores.type", "quiz"] }, then: { $multiply: ["$scores.score", 0.3] } },
                      { case: { $eq: ["$scores.type", "homework"] }, then: { $multiply: ["$scores.score", 0.2] } },
                    ],
                    default: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: "$learner_id",  // Group by learner_id
                weightedAverage: { $sum: "$weightedScore" },  // Sum the weighted scores for each learner
              },
            },
            { $match: { weightedAverage: { $gt: 70 } } },  // Match learners with a weighted average above 70
            { $count: "count" },  // Count the learners with weighted average above 70
          ],
        },
      },

      {
        $project: {
          totalLearners: { $arrayElemAt: ["$totalLearners.count", 0] },  // Extract total learners count
          learnersAbove70: { $arrayElemAt: ["$learnersAbove70.count", 0] },  // Extract learners above 70 count
        },
      },

      // Step 4: Add percentageAbove70 field
      {
        $addFields: {
          percentageAbove70: {
            $cond: [
              { $eq: ["$totalLearners", 0] },  // If no learners, set percentage to 0
              0,
              { $multiply: [{ $divide: ["$learnersAbove70", "$totalLearners"] }, 100] }  // Calculate percentage
            ],
          },
        },
      },
    ])
    .toArray();

  // If no result found or no learners in the class, return a response with 0s
  if (!result || result.length === 0) {
    return res.status(404).send({
      totalLearners: 0,
      learnersAbove70: 0,
      percentageAbove70: 0,
    });
  }

  // Send the result for the specific class
  return res.status(200).send(result[0]);
});


async function createIndexes() {
  const collection = await db.collection('grades');

  // single-field index on class_id
  await collection.createIndex({ class_id: 1 });

  // single-field index on learner_id
  await collection.createIndex({ learner_id: 1 });

  // compound index on learner_id and class_id (ascending)
  await collection.createIndex({ learner_id: 1, class_id: 1 });

  console.log("Indexes created successfully.");
}

createIndexes();

async function createValidation() {
  const collectionName = 'grades';
  // Update collection validation rules
  await db.command({
    collMod: collectionName,
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["class_id", "learner_id"],
        properties: {
          class_id: {
            bsonType: "int",
            minimum: 0,
            maximum: 300,
          },
          learner_id: {
            bsonType: "int",
            minimum: 0,
          },
        },
      },
    },
    validationAction: "warn", // Set validation action to "warn"
  });

  console.log("Validation rules updated successfully.");
}
createValidation();

export default router;
